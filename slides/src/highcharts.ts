// SPDX-License-Identifier: MIT
// Adapter code is MIT. Highcharts itself uses the Highsoft commercial license.
import Highcharts from 'highcharts/es-modules/masters/highcharts.src.js'
import 'highcharts/es-modules/masters/highcharts-more.src.js'
import 'highcharts/es-modules/masters/modules/xrange.src.js'
import 'highcharts/es-modules/masters/modules/exporting.src.js'
import 'highcharts/es-modules/masters/modules/accessibility.src.js'
interface ChartLike { w: number; h: number; option: Record<string, unknown> }
import { cssDecodeIdentEscapes } from '../../kernel/src/svgsafe.ts'

// No callbacks or fetching options from a foreign document. The separate
// untrusted gate also rejects functions, prototype keys and oversized JSON.
const REMOVED = new Set(['__proto__', 'constructor', 'prototype', 'events', 'renderTo', 'data', 'exporting', 'navigation', 'sonification', 'responsive'])
export function safeHighchartsOptions(input: unknown): Record<string, any> {
  let budget = 20000
  const clean = (value: any, depth: number): any => {
    if (--budget < 0 || depth > 12) throw new Error('Chart configuration is too large')
    if (typeof value === 'function' || typeof value === 'symbol') throw new Error('Chart options must be JSON, without functions')
    if (typeof value === 'string') {
      const decoded = cssDecodeIdentEscapes(value)
      if (/url\s*\(|(?:https?|ftp|file|javascript|data|blob):|^\s*\/\/|<(?:img|image|iframe|object|embed|script|link|style|a)\b|(?:href|src)\s*=/i.test(decoded)) return ''
      return value
    }
    if (value === null || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1))
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) {
      // `data` under series/points is numeric data; top-level data is the
      // optional Highcharts data-loader configuration (not included here).
      if (REMOVED.has(k) && !(k === 'data' && depth > 0)) continue
      if (['href', 'src', 'image', 'backgroundImage', 'className'].includes(k)) continue
      if (k === 'useHTML') { out[k] = false; continue }
      out[k] = clean(v, depth + 1)
    }
    return out
  }
  const result = clean(input, 0)
  if (!result || Array.isArray(result) || typeof result !== 'object') throw new Error('Chart options must be a JSON object')
  return result
}

function options(el: ChartLike, live: boolean): any {
  const o = safeHighchartsOptions(el.option)
  const w = Math.max(1, Math.min(16000, Number(el.w) || 1)), h = Math.max(1, Math.min(16000, Number(el.h) || 1))
  return Highcharts.merge({ chart: { zooming: { type: 'xy' } }, title: { text: null }, credits: { enabled: false },
    colors: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272'],
    xAxis: {}, yAxis: { title: { text: null } },
  }, o, {
    chart: { width: w, height: h, animation: false, reflow: false, styledMode: false },
    accessibility: { enabled: live },
    exporting: { enabled: false, local: true, fallbackToExportServer: false, url: '', libURL: '' },
    plotOptions: { series: { animation: false } }, tooltip: { useHTML: false, outside: false },
  })
}
const snapshots = new Map<string, string>()
const blank = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
export function highchartsSnapshot(el: ChartLike): string {
  const key = `${el.w}x${el.h}:${JSON.stringify(el.option)}`
  const hit = snapshots.get(key)
  if (hit) return hit
  const host = document.createElement('div')
  host.dataset.bentoTransient = ''
  host.style.cssText = 'position:fixed;left:-30000px;top:0;pointer-events:none;'
  document.body.append(host)
  let chart: Highcharts.Chart | undefined
  try {
    chart = Highcharts.chart(host, options(el, false))
    const svg = (chart as Highcharts.Chart & { getSVG(): string }).getSVG()
    if (snapshots.size >= 60) snapshots.clear()
    snapshots.set(key, svg)
    return svg
  } catch (error) {
    // An explicit message is preferable to a silent empty slide.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', `0 0 ${el.w} ${el.h}`)
    const text = document.createElementNS(svg.namespaceURI, 'text')
    text.setAttribute('x', '12'); text.setAttribute('y', '24'); text.setAttribute('fill', '#b42318')
    text.textContent = `Highcharts: ${error instanceof Error ? error.message : String(error)}`
    svg.append(text)
    return new XMLSerializer().serializeToString(svg) || blank
  } finally { chart?.destroy(); host.remove() }
}
export function mountHighcharts(el: ChartLike, host: HTMLElement): () => void {
  host.innerHTML = ''
  try {
    const chart = Highcharts.chart(host, options(el, true))
    // Reveal can scale/reposition the parent after mounting. Highcharts caches
    // the initial chart offset (sometimes while the section is still hidden),
    // so refresh it before events are normalized into chart coordinates.
    const invalidatePosition = () => { delete (chart.pointer as unknown as { chartPosition?: unknown }).chartPosition }
    const events = ['mousemove', 'mousedown', 'touchstart', 'touchmove'] as const
    for (const event of events) host.addEventListener(event, invalidatePosition, { capture: true, passive: true })
    return () => {
      for (const event of events) host.removeEventListener(event, invalidatePosition, true)
      chart.destroy()
    }
  } catch {
    host.innerHTML = highchartsSnapshot(el)
    return () => { host.innerHTML = '' }
  }
}
