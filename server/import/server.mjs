// SPDX-License-Identifier: MIT
// Internal converter: bounded streaming uploads, serial child processes, local shell.
import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { pipeline } from 'node:stream/promises'
import { configFromEnv, root } from './config.mjs'
const require = createRequire(path.join(root, 'slides/package.json'))
const ID = /^[a-f0-9]{48}$/
const id = () => randomBytes(24).toString('hex')
const error = (status, message) => Object.assign(new Error(message), { status })

// Do not destroy the request on a size error: allow the HTTP 413 to reach the client.
function receive(req, target, max) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(target, { flags: 'wx' })
    let bytes = 0, done = false
    function finish(err) {
      if (done) return
      done = true
      req.off('data', data); req.off('end', end); req.off('aborted', aborted); req.off('error', failed)
      if (err) { out.once('close', () => reject(err)); out.destroy(); req.resume() } else resolve(bytes)
    }
    const aborted = () => finish(error(400, 'Upload interrupted'))
    const failed = (err) => finish(err)
    const end = () => out.end()
    function data(chunk) {
      bytes += chunk.length
      if (bytes > max) return finish(error(413, 'File exceeds upload limit'))
      if (!out.write(chunk)) req.pause()
    }
    out.on('drain', () => req.resume())
    out.on('error', failed)
    out.on('finish', () => finish(bytes ? null : error(400, 'Empty file')))
    req.on('data', data); req.on('end', end); req.on('aborted', aborted); req.on('error', failed)
  })
}

export async function startServer(config = configFromEnv()) {
  const { build } = require('esbuild')
  const shell = await fsp.readFile(config.shell, 'utf8').catch(() => { throw new Error('Local shell missing: run npm run build:single in slides, or set BENTO_SHELL') })
  if (!shell.includes('<script type="application/bento+json" id="bento-doc">'))
    throw new Error('BENTO_SHELL is not a bento/slides HTML shell')
  const jobsDir = path.join(config.dataDir, 'jobs')
  await fsp.mkdir(jobsDir, { recursive: true })
  // A dedicated instance directory prevents accidental cleanup by another process.
  const runtime = await fsp.mkdtemp(path.join(config.dataDir, 'runtime-'))
  const worker = path.join(runtime, 'worker.mjs')
  await build({ entryPoints: [path.join(root, 'server/import/worker.ts')], bundle: true,
    platform: 'node', format: 'esm', outfile: worker, logLevel: 'silent' })
  const jobs = new Map(), sessions = new Map()
  const persist = (job) => fsp.writeFile(path.join(job.dir, 'job.json'), JSON.stringify({
    name: job.name, state: job.state, createdAt: job.createdAt, finishedAt: job.finishedAt, error: job.error,
  }))
  for (const key of await fsp.readdir(jobsDir)) {
    if (!ID.test(key)) continue
    const dir = path.join(jobsDir, key)
    let saved
    try { saved = JSON.parse(await fsp.readFile(path.join(dir, 'job.json'), 'utf8')) } catch { saved = {} }
    const stat = await fsp.stat(dir)
    const job = { id: key, dir, name: saved.name || 'Interrupted upload', createdAt: saved.createdAt || stat.mtimeMs,
      finishedAt: saved.finishedAt || stat.mtimeMs, state: saved.state === 'done' ? 'done' : 'failed',
      error: saved.state === 'done' ? undefined : saved.error || 'Server restarted; upload the presentation again' }
    jobs.set(key, job)
    await fsp.rm(path.join(dir, 'input.pptx'), { force: true })
  }
  let active = null, activeDone = Promise.resolve(), closing = false
  const publicJob = (job) => ({ id: job.id, name: job.name, state: job.state, createdAt: job.createdAt,
    expiresAt: job.finishedAt ? job.finishedAt + config.ttlMs : null, error: job.error,
    download: job.state === 'done' ? `/api/jobs/${job.id}/html` : null,
    report: job.state === 'done' ? `/api/jobs/${job.id}/report` : null })
  const erase = async (job) => {
    await fsp.rm(job.dir, { recursive: true, force: true })
    jobs.delete(job.id)
  }
  async function cleanup() {
    const now = Date.now()
    for (const job of jobs.values()) if (job.finishedAt && now - job.finishedAt > config.ttlMs) await erase(job)
    // Restarted jobs cannot be resumed. Expire orphan directories by age.
    for (const name of await fsp.readdir(jobsDir)) {
      if (!ID.test(name) || jobs.has(name)) continue
      const dir = path.join(jobsDir, name), stat = await fsp.stat(dir).catch(() => null)
      if (stat && now - stat.mtimeMs > config.ttlMs) await fsp.rm(dir, { recursive: true, force: true })
    }
    for (const [key, expiry] of sessions) if (expiry < now) sessions.delete(key)
  }
  function pump() {
    if (closing || active) return
    const job = [...jobs.values()].find((j) => j.state === 'queued')
    if (!job) return
    job.state = 'converting'
    const child = spawn(process.execPath, ['--max-old-space-size=4096', worker,
      path.join(job.dir, 'input.pptx'), config.shell, path.join(job.dir, 'result.bento.html'),
      path.join(job.dir, 'report.json'), String(config.maxInputMb), String(config.maxUnpackedMb)],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    active = child
    let finish
    activeDone = new Promise((resolve) => { finish = resolve })
    let diagnostic = '', timedOut = false
    child.stderr.on('data', (b) => { diagnostic = (diagnostic + b.toString()).slice(-8000) })
    child.on('error', (e) => { diagnostic = e.message })
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, config.timeoutMs)
    child.once('close', async (code) => {
      clearTimeout(timer)
      job.state = code === 0 && !timedOut ? 'done' : 'failed'
      job.error = job.state === 'failed' ? (timedOut ? 'Conversion timed out' : diagnostic.trim() || 'Conversion process failed') : undefined
      job.finishedAt = Date.now()
      // Uploaded source is no longer needed. Failed partial outputs are removed too.
      await fsp.rm(path.join(job.dir, 'input.pptx'), { force: true }).catch(() => {})
      if (job.state === 'failed') for (const name of ['result.bento.html', 'report.json'])
        await fsp.rm(path.join(job.dir, name), { force: true }).catch(() => {})
      await persist(job).catch((e) => console.error('Could not save job state:', e.message))
      active = null
      finish()
      pump()
    })
  }
  const html = await fsp.readFile(new URL('./index.html', import.meta.url))
  const js = await fsp.readFile(new URL('./client.js', import.meta.url))
  const css = await fsp.readFile(new URL('./style.css', import.meta.url))
  const send = (res, status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(value))
  }
  const authorized = (req) => {
    if (!config.token) return true
    const key = /(?:^|;\s*)bento_session=([a-f0-9]{48})(?:;|$)/.exec(req.headers.cookie || '')?.[1]
    return key && sessions.get(key) > Date.now()
  }
  // Keep login attempts bounded even when token comparison fails.
  const attempts = new Map()
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
    try {
      const url = new URL(req.url, 'http://localhost')
      if (req.method !== 'GET') {
        if (req.headers['sec-fetch-site'] === 'cross-site') throw error(403, 'Cross-site request refused')
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)
          throw error(403, 'Origin does not match host')
      }
      if (req.method === 'GET' && ['/', '/client.js', '/style.css'].includes(url.pathname)) {
        const [data, mime] = url.pathname === '/' ? [html, 'text/html'] : url.pathname === '/client.js' ? [js, 'text/javascript'] : [css, 'text/css']
        res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` }); res.end(data); return
      }
      if (req.method === 'GET' && url.pathname === '/api/config')
        return send(res, 200, { maxInputMb: config.maxInputMb, retentionMinutes: config.ttlMs / 60000,
          authenticated: !!authorized(req), authRequired: !!config.token })
      if (req.method === 'POST' && url.pathname === '/api/session') {
        const ip = req.socket.remoteAddress
        const attempt = attempts.get(ip) ?? { n: 0, at: Date.now() }
        if (Date.now() - attempt.at > 60000) { attempt.n = 0; attempt.at = Date.now() }
        attempts.set(ip, attempt)
        if (++attempt.n > 10) throw error(429, 'Too many attempts; wait one minute')
        const chunks = []; let length = 0
        for await (const chunk of req) { length += chunk.length; if (length > 1024) throw error(413, 'Login request too large'); chunks.push(chunk) }
        const provided = Buffer.from(Buffer.concat(chunks).toString('utf8')), expected = Buffer.from(config.token)
        if (!config.token || provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw error(401, 'Incorrect access password')
        if (sessions.size >= 1000) throw error(503, 'Too many sessions')
        const key = id(); sessions.set(key, Date.now() + 8 * 3600000)
        res.setHeader('Set-Cookie', `bento_session=${key}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${config.secureCookies ? '; Secure' : ''}`)
        return send(res, 200, { ok: true })
      }
      if (!authorized(req)) throw error(401, 'Access password required')
      if (req.method === 'POST' && url.pathname === '/api/jobs') {
        const max = config.maxInputMb * 1024 * 1024
        if (Number(req.headers['content-length']) > max) throw error(413, 'File exceeds upload limit')
        if (req.headers['content-type'] !== 'application/octet-stream') throw error(415, 'Send the PPTX as application/octet-stream')
        let name
        try { name = decodeURIComponent(req.headers['x-file-name'] || '') } catch { throw error(400, 'Invalid file name') }
        if (!/\.pptx$/i.test(name) || name.length > 240 || /[\\/\x00-\x1f]/.test(name)) throw error(400, 'Choose a .pptx file (not .ppt)')
        // Finished jobs count too: retained outputs cannot grow without a bound.
        if (jobs.size >= config.maxJobs) throw error(503, 'Server is full. Delete a completed job or wait for automatic cleanup.')
        const key = id(), dir = path.join(jobsDir, key)
        const job = { id: key, dir, name, state: 'uploading', createdAt: Date.now() }
        jobs.set(key, job)
        try {
          await fsp.mkdir(dir)
          await persist(job)
          await receive(req, path.join(dir, 'input.pptx'), max)
          const file = await fsp.open(path.join(dir, 'input.pptx'), 'r')
          const signature = Buffer.alloc(4)
          try { await file.read(signature, 0, 4, 0) } finally { await file.close() }
          if (signature.toString('hex') !== '504b0304') throw error(400, 'Not a PPTX ZIP package')
          job.state = 'queued'; pump()
          return send(res, 202, publicJob(job))
        } catch (e) { await erase(job); throw e }
      }
      const match = /^\/api\/jobs\/([a-f0-9]{48})(?:\/(html|report))?$/.exec(url.pathname)
      if (!match) throw error(404, 'Not found')
      const job = jobs.get(match[1])
      if (!job) throw error(404, 'Job missing or expired; upload the presentation again')
      if (req.method === 'DELETE' && !match[2]) {
        if (!job.finishedAt) throw error(409, 'Wait for conversion to finish before deleting')
        await erase(job); return send(res, 200, { ok: true })
      }
      if (req.method !== 'GET') throw error(405, 'Method not allowed')
      if (!match[2]) return send(res, 200, publicJob(job))
      if (job.state !== 'done') throw error(409, 'Conversion is not complete')
      const report = match[2] === 'report', file = path.join(job.dir, report ? 'report.json' : 'result.bento.html')
      const filename = job.name.replace(/\.pptx$/i, report ? '.report.json' : '.bento.html')
      const stat = await fsp.stat(file)
      res.writeHead(200, { 'Content-Type': report ? 'application/json' : 'application/octet-stream',
        'Content-Length': stat.size, 'Content-Disposition': `attachment; filename="${report ? 'report.json' : 'deck.bento.html'}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/'/g, '%27')}` })
      await pipeline(fs.createReadStream(file), res)
    } catch (e) {
      if (res.headersSent || res.destroyed) { res.destroy(); return }
      if (req.method !== 'GET') { res.setHeader('Connection', 'close'); req.resume() }
      send(res, e.status || 500, { error: e.status ? e.message : 'Server error; check disk space and server configuration' })
    }
  })
  server.requestTimeout = 10 * 60000
  server.headersTimeout = 30000
  await cleanup()
  const interval = setInterval(() => {
    attempts.clear()
    cleanup().catch((e) => console.error('Cleanup failed:', e.message))
  }, 60000).unref()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, config.host, resolve) })
  return {
    server, jobs,
    async close() {
      closing = true; clearInterval(interval)
      const current = active
      if (current) {
        // The close event may already have fired while its async cleanup is
        // still running. Wait for that cleanup, not a second close event.
        const stopped = activeDone
        if (current.exitCode === null && current.signalCode === null) current.kill('SIGKILL')
        await stopped
      }
      server.closeAllConnections()
      await new Promise((resolve, reject) => server.close((e) => e ? reject(e) : resolve()))
      await fsp.rm(runtime, { recursive: true, force: true })
    },
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const app = await startServer()
    const addr = app.server.address()
    console.log(`bento/import listening on ${addr.address}:${addr.port}; conversion uses a local shell`)
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { app.close().then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1) }) })
  } catch (e) { console.error(e.message); process.exitCode = 1 }
}
