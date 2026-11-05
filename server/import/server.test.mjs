// SPDX-License-Identifier: MIT
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { spawnSync } from 'node:child_process'
import { startServer } from './server.mjs'
import { configFromEnv, root } from './config.mjs'
import { chartFixture } from '../../scripts/test-convert/_chart-import-fixtures.ts'
import { fxMinimal } from '../../scripts/test-convert/_fixtures.ts'
import { readZip, writeZip } from '../../kernel/src/convert/zip.ts'
import { preflight } from '../../convert/src/limits.ts'
const shell = path.join(root, 'slides/dist-single/Bento_Slides.bento.html')
const fixture = await fxMinimal()
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bento server test '))
const base = configFromEnv({ BENTO_PORT: '0', BENTO_DATA_DIR: temp, BENTO_MAX_INPUT_MB: '1' })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const uploadHeaders = { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent('临床 demo.pptx') }
async function terminal(url, key, headers = {}) {
  for (let i = 0; i < 200; i++) {
    const r = await fetch(`${url}/api/jobs/${key}`, { headers }), j = await r.json()
    if (['done', 'failed'].includes(j.state)) return j
    await wait(100)
  }
  throw new Error('Job did not finish')
}
async function launch(overrides = {}) {
  const dir = await fs.mkdtemp(path.join(temp, 'instance '))
  const config = { ...base, dataDir: dir, ...overrides }
  const app = await startServer(config)
  return { ...app, config, url: `http://127.0.0.1:${app.server.address().port}` }
}
async function post(app, body = fixture, headers = {}) {
  const r = await fetch(app.url + '/api/jobs', { method: 'POST', headers: { ...uploadHeaders, ...headers }, body })
  return { status: r.status, data: await r.json() }
}

try {
  await test('real HTTP conversion, report, download, capacity, restart and delete', async () => {
    let app = await launch({ maxJobs: 1 })
    try {
      assert.equal((await fetch(app.url)).status, 200)
      const uploaded = await post(app)
      assert.equal(uploaded.status, 202)
      assert.equal((await post(app)).status, 503)
      const job = await terminal(app.url, uploaded.data.id)
      assert.equal(job.state, 'done', job.error)
      const html = await fetch(app.url + job.download)
      assert.match(html.headers.get('content-disposition'), /%E4%B8%B4/)
      const content = await html.text()
      assert.match(content, /Rig Deck/)
      assert.match(content, /Hello, Bento/)
      assert.match(content, /bento\/deflate/)
      const report = await (await fetch(app.url + job.report)).json()
      assert.ok(Array.isArray(report.entries)); assert.ok(Array.isArray(report.gated))
      await assert.rejects(fs.stat(path.join(app.config.dataDir, 'jobs', job.id, 'input.pptx')))
      const cfg = app.config
      await app.close()
      const next = await startServer(cfg)
      app = { ...next, config: cfg, url: `http://127.0.0.1:${next.server.address().port}` }
      assert.equal((await fetch(app.url + job.download)).status, 200)
      assert.equal((await post(app)).status, 503)
      assert.equal((await fetch(app.url + `/api/jobs/${job.id}`, { method: 'DELETE' })).status, 200)
      assert.equal((await fetch(app.url + job.download)).status, 404)
      assert.equal((await fs.readdir(path.join(cfg.dataDir, 'jobs'))).length, 0)
    } finally { await app.close() }
  })
  await test('authentication, HttpOnly session and origin checks', async () => {
    const app = await launch({ token: 'test-password-with-enough-length' })
    try {
      assert.equal((await post(app)).status, 401)
      assert.equal((await fetch(app.url + '/api/session', { method: 'POST', body: 'wrong' })).status, 401)
      const login = await fetch(app.url + '/api/session', { method: 'POST', body: app.config.token })
      assert.equal(login.status, 200)
      const cookie = login.headers.get('set-cookie')
      assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/)
      const headers = { Cookie: cookie.split(';')[0] }
      assert.equal((await post(app, fixture, { ...headers, Origin: 'https://evil.example' })).status, 403)
      assert.equal((await post(app, fixture, headers)).status, 202)
    } finally { await app.close() }
  })
  await test('native chart survives the real worker, shape gate and downloaded HTML', async () => {
    const app = await launch()
    try {
      const uploaded = await post(app, await chartFixture())
      assert.equal(uploaded.status, 202)
      const job = await terminal(app.url, uploaded.data.id)
      assert.equal(job.state, 'done', job.error)
      const html = await (await fetch(app.url + job.download)).text()
      const block = html.match(/<script[^>]*id="bento-doc"[^>]*>([\s\S]*?)<\/script>/)?.[1]
      assert.ok(block)
      const chart = JSON.parse(block).slides[0].elements[0]
      assert.equal(chart.type, 'chart')
      assert.equal(chart.option.chart.type, 'column')
      assert.deepEqual(chart.option.series[0].data, [12,null,-4.25])
      assert.deepEqual(chart.option.xAxis.categories, ['基线','第2周','第4周'])
      const report = await (await fetch(app.url + job.report)).json()
      assert.deepEqual(report.gated, [])
      assert.ok(report.entries.some(e=>e.code==='chart-imported-from-cache'))
    } finally { await app.close() }
  })
  await test('oversized, malformed and traversal uploads release their slots', async () => {
    const app = await launch()
    try {
      assert.equal((await post(app, new Uint8Array(1048577))).status, 413)
      assert.equal((await post(app, fixture, { 'X-File-Name': '..%2Fescape.pptx' })).status, 400)
      assert.equal((await post(app, 'not a zip')).status, 400)
      assert.equal(app.jobs.size, 0)
      assert.equal((await fs.readdir(path.join(app.config.dataDir, 'jobs'))).length, 0)
      // Size enforcement also applies to chunked requests with no Content-Length.
      const response = await new Promise((resolve, reject) => {
        const req = http.request(app.url + '/api/jobs', { method: 'POST', headers: uploadHeaders }, (res) => {
          res.resume(); res.on('end', () => resolve(res.statusCode))
        })
        req.on('error', reject)
        req.write(Buffer.alloc(524288)); req.write(Buffer.alloc(524288)); req.end(Buffer.alloc(10))
      })
      assert.equal(response, 413)
      assert.equal(app.jobs.size, 0)
    } finally { await app.close() }
  })
  await test('bad ZIP fails in worker, source is removed, server survives', async () => {
    const app = await launch()
    try {
      const uploaded = await post(app, Buffer.from('PK\x03\x04broken zip'))
      assert.equal(uploaded.status, 202)
      const job = await terminal(app.url, uploaded.data.id)
      assert.equal(job.state, 'failed')
      assert.ok(job.error)
      await assert.rejects(fs.stat(path.join(app.config.dataDir, 'jobs', job.id, 'input.pptx')))
      assert.equal((await fetch(app.url + '/api/config')).status, 200)
    } finally { await app.close() }
  })
  await test('worker timeout and expiry remove partial and retained files', async () => {
    const app = await launch({ timeoutMs: 1, ttlMs: 1 })
    try {
      const { data } = await post(app)
      const job = await terminal(app.url, data.id)
      assert.equal(job.state, 'failed')
      assert.match(job.error, /timed out/)
      await wait(10)
      const cfg = app.config
      await app.close()
      const next = await startServer(cfg)
      try { assert.equal(next.jobs.size, 0); assert.equal((await fs.readdir(path.join(cfg.dataDir, 'jobs'))).length, 0) }
      finally { await next.close() }
    } finally { if (app.server.listening) await app.close() }
  })
  await test('limits reject unsafe values and keep ZIP compression protections', () => {
    assert.throws(() => configFromEnv({ BENTO_HOST: '0.0.0.0' }), /BENTO_TOKEN/)
    assert.throws(() => configFromEnv({ BENTO_MAX_INPUT_MB: 'NaN' }), /integer/)
    assert.throws(() => preflight(fixture, { inputBytes: -1 }), /invalid import limit/)
    const fake = new Uint8Array(22 + 46)
    const v = new DataView(fake.buffer)
    v.setUint32(0, 0x02014b50, true); v.setUint32(20, 1, true); v.setUint32(24, 2 * 1048576, true)
    v.setUint32(46, 0x06054b50, true); v.setUint16(56, 1, true)
    assert.throws(() => preflight(fake, { inputBytes: 500 * 1048576, totalUncompressed: 1500 * 1048576 }), /compresses/)
  })
  await test('a real ZIP over 100 MiB converts via HTTP with explicit server limits and CLI overrides', async () => {
    const parts = await readZip(fixture)
    const big = await writeZip([...parts].map(([name, data]) => ({ name, data })).concat([
      { name: 'unused-padding.bin', data: new Uint8Array(101 * 1048576) },
    ]), { store: true })
    assert.ok(big.length > 100 * 1048576)
    assert.throws(() => preflight(big), /limit is 100MB/)
    const app = await launch({ maxInputMb: 110, maxUnpackedMb: 120 })
    try {
      const { status, data } = await post(app, big)
      assert.equal(status, 202)
      const job = await terminal(app.url, data.id)
      assert.equal(job.state, 'done', job.error)
      const input = path.join(temp, 'big deck.pptx'), output = path.join(temp, 'big deck.bento.html')
      await fs.writeFile(input, big)
      const cli = spawnSync(process.execPath, [path.join(root, 'convert/cli.mjs'), input,
        '--offline', '--shell', shell, '--max-input-mb', '110', '--max-uncompressed-mb', '120', '-o', output], { encoding: 'utf8', timeout: 120000 })
      assert.equal(cli.status, 0, cli.stderr)
      assert.match(await fs.readFile(output, 'utf8'), /Rig Deck/)
    } finally { await app.close() }
  })
} finally { await fs.rm(temp, { recursive: true, force: true }) }
