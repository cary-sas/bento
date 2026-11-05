// SPDX-License-Identifier: MIT
// Automated browser acceptance test, run on Windows and Linux CI.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import { configFromEnv } from './config.mjs'
import { startServer } from './server.mjs'
import { chartFixture } from '../../scripts/test-convert/_chart-import-fixtures.ts'
import { fxMinimal } from '../../scripts/test-convert/_fixtures.ts'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bento browser '))
const app = await startServer(configFromEnv({ BENTO_PORT: '0', BENTO_DATA_DIR: path.join(temp, 'data') }))
const base = `http://127.0.0.1:${app.server.address().port}`
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH })
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true })
  await ctx.route('**/*', (route) => route.request().url().startsWith(base) || route.request().url().startsWith('file:') ? route.continue() : route.abort())
  const page = await ctx.newPage(), errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(base)
  await page.locator('#upload').waitFor({ state: 'visible' })
  const input = path.join(temp, 'demo.pptx')
  await fs.writeFile(input, await fxMinimal())
  await page.locator('#file').setInputFiles(input)
  await page.locator('#convert').click()
  await page.locator('#download').waitFor({ state: 'visible', timeout: 60000 })
  assert.match(await page.locator('#state').innerText(), /Ready/)
  await page.locator('#findings').click()
  await page.waitForFunction(() => document.querySelector('#report-text').textContent.includes('\"gated\"'))
  const downloadEvent = page.waitForEvent('download')
  await page.locator('#download').click()
  const download = await downloadEvent, saved = path.join(temp, 'converted.bento.html')
  await download.saveAs(saved)
  assert.match(await fs.readFile(saved, 'utf8'), /Rig Deck/)
  const deck = await ctx.newPage()
  deck.on('pageerror',e=>errors.push(e.message))
  await deck.goto(pathToFileURL(saved).href)
  await deck.waitForFunction(() => window.bento?.doc?.title === 'Rig Deck', null, { timeout: 60000 })
  assert.equal(await deck.evaluate(() => window.bento.doc.slides.length), 1)
  await deck.close()
  await fs.mkdir(path.join(temp, 'screenshots'))
  if (process.env.BENTO_SCREENSHOTS) {
    await fs.mkdir(process.env.BENTO_SCREENSHOTS, { recursive: true })
    await page.screenshot({ path: path.join(process.env.BENTO_SCREENSHOTS, 'desktop.png'), fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  if (process.env.BENTO_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.BENTO_SCREENSHOTS, 'mobile.png'), fullPage: true })
  await page.locator('#delete').click()
  await page.locator('#upload').waitFor({ state: 'visible' })
  assert.equal(await page.locator('#result').isVisible(), false)
  // Upload a native chart through the real server, then boot its downloaded
  // single-file document with all outbound HTTP requests still blocked.
  const chartInput = path.join(temp,'chart.pptx')
  await fs.writeFile(chartInput,await chartFixture())
  await page.locator('#file').setInputFiles(chartInput)
  await page.locator('#convert').click()
  await page.locator('#download').waitFor({state:'visible',timeout:60000})
  const chartDownloadEvent=page.waitForEvent('download')
  await page.locator('#download').click()
  const chartDownload=await chartDownloadEvent, chartFile=path.join(temp,'chart.bento.html')
  await chartDownload.saveAs(chartFile)
  const chartPage=await ctx.newPage()
  chartPage.on('pageerror',e=>errors.push(e.message))
  await chartPage.goto(pathToFileURL(chartFile).href)
  await chartPage.locator('.ed-stage-scale svg.highcharts-root').waitFor()
  assert.equal(await chartPage.locator('.ed-stage-scale .highcharts-series-group .highcharts-point').count(),2)
  assert.deepEqual(await chartPage.evaluate(()=>window.bento.doc.slides[0].elements[0].option.series[0].data),[12,null,-4.25])
  if(process.env.BENTO_SCREENSHOTS) await chartPage.screenshot({path:path.join(process.env.BENTO_SCREENSHOTS,'server-imported-chart.png'),fullPage:true})
  assert.deepEqual(errors, [])
  console.log('Browser acceptance passed: upload, report, download, offline deck boot, mobile layout, delete, native chart upload/download/render without outbound requests.')
} finally { await browser.close(); await app.close(); await fs.rm(temp, { recursive: true, force: true }) }
