// SPDX-License-Identifier: MIT
// DrawingML chart caches → native Highcharts data. No workbook, URL or script
// is opened: the embedded chart cache is the presentation's displayed data.
import { NS, kid, kids, attr, textOf, type XElem } from './xml.ts'
import { resolveColor } from './theme.ts'
import type { InheritCtx, OutChart } from './types.ts'
import type { GroupFrame } from './shapes.ts'
import { EMU_PER_PX } from './types.ts'

const ck = (e: XElem | undefined, name: string): XElem | undefined => e && kid(e, NS.c, name)
const cv = (e: XElem | undefined, name: string): string | undefined => {
  const n = ck(e, name)
  return n && attr(n, 'val')
}
const ak = (e: XElem | undefined, name: string): XElem | undefined => e && kid(e, NS.a, name)
const txt = (e: XElem | undefined): string => e ? textOf(e) : ''
const px = (v: number): number => Math.round(v / EMU_PER_PX * 100) / 100
const MAX_POINTS = 2000

/** Indexed points are sparse. Filling absent numeric points with zero would
 * change the observation; retain the missing positions as null instead. */
function cache(parent: XElem | undefined, numeric: boolean): Array<string | number | null> | undefined {
  if (!parent) return undefined
  const ref = ck(parent, numeric ? 'numRef' : 'strRef')
  const node = ck(ref, numeric ? 'numCache' : 'strCache') ?? ck(parent, numeric ? 'numLit' : 'strLit')
  if (!node) return undefined
  const points = kids(node, NS.c, 'pt')
  const countText = cv(node, 'ptCount')
  const count = countText === undefined ? 0 : Number(countText)
  if (!Number.isInteger(count) || count < 0 || count > MAX_POINTS) return undefined
  let length = count
  const indexed = new Map<number, string | number | null>()
  for (const point of points) {
    const rawIndex = attr(point, 'idx')
    if (rawIndex === undefined || !/^\d+$/.test(rawIndex)) return undefined
    const i = Number(rawIndex)
    if (i >= MAX_POINTS || indexed.has(i) || countText !== undefined && i >= count) return undefined
    const raw = txt(ck(point, 'v')).trim()
    if (numeric && raw !== '' && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) return undefined
    const value = numeric ? raw === '' ? null : Number(raw) : txt(ck(point, 'v'))
    if (typeof value === 'number' && !Number.isFinite(value)) return undefined
    indexed.set(i, value)
    length = Math.max(length, i + 1)
  }
  return Array.from({ length }, (_, i) => indexed.get(i) ?? null)
}

function plainText(node: XElem | undefined): string {
  if (!node) return ''
  if (node.ns === NS.a && node.local === 't') return textOf(node)
  return kids(node).map(plainText).join('')
}

function axisOptions(node: XElem): Record<string, unknown> {
  const scaling = ck(node, 'scaling')
  const out: Record<string, unknown> = { title: { text: plainText(ck(node, 'title')) || null } }
  for (const key of ['min', 'max'] as const) {
    const raw = cv(scaling, key)
    if (raw !== undefined && Number.isFinite(Number(raw))) out[key] = Number(raw)
  }
  if (cv(scaling, 'orientation') === 'maxMin') out.reversed = true
  const log = cv(scaling, 'logBase')
  if (log !== undefined) out.type = 'logarithmic'
  const position = cv(node, 'axPos')
  if (position === 'r' || position === 't') out.opposite = true
  return out
}

/** Unsupported/missing data returns undefined, letting the host retain a
 * marked placeholder and a precise fidelity report rather than invent data. */
export function chartFrom(
  root: XElem, frame: GroupFrame, id: string, ctx: InheritCtx, where: string,
): OutChart | undefined {
  const reject = (reason: string): undefined => {
    ctx.report.add('dropped', 'chart-import-unsupported', where, `${reason} — a placeholder marks the chart`)
    return undefined
  }
  const chart = ck(root, 'chart'), plot = ck(chart, 'plotArea')
  if (!plot) return reject('Chart plot area is missing')
  const plots = kids(plot).filter(n => n.ns === NS.c && /Chart$/.test(n.local))
  const mapping: Record<string, string> = {
    barChart: 'column', lineChart: 'line', areaChart: 'area',
    pieChart: 'pie', doughnutChart: 'pie', scatterChart: 'scatter',
  }
  if (!plots.length || plots.some(n => !mapping[n.local])) return reject('This chart type has no Highcharts importer')
  if (plots.some(n => n.local === 'pieChart' || n.local === 'doughnutChart') && plots.length > 1) return reject('Mixed pie plots are unsupported')
  const axes = kids(plot).filter(n => n.ns === NS.c && ['catAx', 'dateAx', 'valAx'].includes(n.local))
  if (axes.some(n => n.local === 'dateAx')) return reject('Date axes require date serial conversion')
  const yAxes: Record<string, unknown>[] = [], yIds = new Map<string, number>()
  const series: Record<string, unknown>[] = []
  let categories: string[] | undefined
  let type = 'column', valuesBudget = 0
  for (const group of plots) {
    type = mapping[group.local]
    if (group.local === 'barChart' && cv(group, 'barDir') === 'bar') type = 'bar'
    const axisIds = kids(group, NS.c, 'axId').map(n => attr(n, 'val'))
    // Resolve the axis IDs, not their order in the plot group.
    const groupAxes = axisIds.map(id => axes.find(n => cv(n, 'axId') === id)).filter((n): n is XElem => !!n)
    const yNode = type === 'scatter'
      ? groupAxes.find(n => ['l','r'].includes(cv(n, 'axPos') ?? '')) ?? groupAxes[1]
      : groupAxes.find(n => n.local === 'valAx')
    const yId = yNode && cv(yNode, 'axId')
    let yAxis = 0
    if (yId && yNode) {
      if (!yIds.has(yId)) { yIds.set(yId, yAxes.length); yAxes.push(axisOptions(yNode)) }
      yAxis = yIds.get(yId)!
    }
    for (const s of kids(group, NS.c, 'ser')) {
      if (series.length >= 50) return reject('Chart exceeds the 50-series import limit')
      const tx = ck(s, 'tx')
      const name = cache(tx, false)?.[0] ?? txt(ck(tx, 'v'))
      const values = cache(ck(s, type === 'scatter' ? 'yVal' : 'val'), true)
      if (!values?.length) return reject('Chart numeric cache is missing, invalid or exceeds 2000 points')
      valuesBudget += values.length * (type === 'pie' || type === 'scatter' ? 4 : 1)
      if (valuesBudget > 12000) return reject('Chart exceeds the import data budget')
      const out: Record<string, unknown> = { type, name: name || `Series ${series.length + 1}`, yAxis }
      const spPr = kid(s, NS.c, 'spPr')
      const markerPr = ck(s, 'marker') && kid(ck(s, 'marker')!, NS.c, 'spPr')
      const color = resolveColor(ak(spPr, 'solidFill') ?? ak(ak(spPr, 'ln'), 'solidFill') ?? ak(markerPr, 'solidFill'), ctx.theme)
      if (color) out.color = color.css
      if (type === 'scatter') {
        const xs = cache(ck(s, 'xVal'), true)
        if (!xs || xs.length !== values.length) return reject('Scatter X/Y caches do not match')
        out.data = values.map((y, i) => [xs[i], y])
        if (xs.some(x => x === null)) return reject('Scatter X cache contains missing coordinates')
        const style = cv(group, 'scatterStyle') ?? 'marker'
        out.lineWidth = style === 'marker' || style === 'none' ? 0 : 2
      } else {
        const cat = ck(s, 'cat')
        const labels = cache(cat, false) ?? cache(cat, true)
        if (cat && !labels) return reject('Chart category cache is missing or unsupported')
        const names = Array.from({ length: values.length }, (_, i) => String(labels?.[i] ?? i + 1))
        if (labels && labels.length !== values.length) return reject('Chart category and value caches differ in length')
        if (type === 'pie') {
          if (series.length || kids(group, NS.c, 'ser').length !== 1) return reject('Multiple pie series are unsupported')
          out.data = values.map((y, i) => ({ name: names[i], y }))
          if (group.local === 'doughnutChart') out.innerSize = `${Number(cv(group, 'holeSize') ?? 50)}%`
        } else {
          if (categories && JSON.stringify(categories) !== JSON.stringify(names)) return reject('Series use different category axes')
          categories = names
          out.data = values
        }
      }
      for (const point of kids(s, NS.c, 'dPt')) {
        const index = Number(cv(point, 'idx'))
        const pointColor = resolveColor(ak(ck(point, 'spPr'), 'solidFill'), ctx.theme)
        const data = out.data as any[]
        if (pointColor && Number.isInteger(index) && index >= 0 && index < data.length) {
          const value = data[index]
          data[index] = { ...(Array.isArray(value) ? { x: value[0], y: value[1] } : value && typeof value === 'object' ? value : { y: value }), color: pointColor.css }
        }
      }
      const grouping = cv(group, 'grouping')
      if (grouping === 'stacked' || grouping === 'percentStacked') out.stacking = grouping === 'stacked' ? 'normal' : 'percent'
      if (type === 'line' && cv(s, 'smooth') === '1') out.type = 'spline'
      series.push(out)
    }
  }
  if (!series.length) return reject('Chart contains no series')
  const types = new Set(series.map(s => s.type))
  if (types.has('bar') && types.size > 1 || types.has('scatter') && types.size > 1) return reject('Mixed horizontal or scatter plots are unsupported')
  if (frame.flipH || frame.flipV) ctx.report.add('approximated', 'flip-dropped', where, 'Chart reflection has no bento chart field')
  const firstIds = kids(plots[0], NS.c, 'axId').map(n => attr(n, 'val'))
  const xNode = axes.find(n => firstIds.includes(cv(n, 'axId')) && (n.local === 'catAx' ||
    n.local === 'valAx' && ['b','t'].includes(cv(n, 'axPos') ?? '')))
  const xAxis = xNode ? axisOptions(xNode) : {}
  if (categories) xAxis.categories = categories
  ctx.report.add('approximated', 'chart-imported-from-cache', where,
    'Chart imported as editable Highcharts from embedded caches; workbook formulas are not recalculated, and Office styling, labels and layout may differ')
  return {
    id, type: 'chart', preset: type as OutChart['preset'],
    x: px(frame.x), y: px(frame.y), w: px(frame.w), h: px(frame.h), rotation: frame.rotation, opacity: 1,
    option: { chart: { type }, title: { text: plainText(ck(chart, 'title')) || null },
      legend: { enabled: !!ck(chart, 'legend') }, xAxis, yAxis: yAxes.length ? yAxes : [{}], series },
  }
}
