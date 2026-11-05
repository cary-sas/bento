// SPDX-License-Identifier: MIT
// Pure data helpers: safe in Node (converter), never import the chart runtime.
export type ChartOptions = Record<string, any>
const own = (v: any): ChartOptions => v && typeof v === 'object' && !Array.isArray(v) ? v : {}
const axis = (v: any): ChartOptions => own(Array.isArray(v) ? v[0] : v)
export const HIGHCHARTS_PRESETS: Record<string, () => ChartOptions> = {
  column: () => ({ chart: { type: 'column' }, xAxis: { categories: ['Q1', 'Q2', 'Q3', 'Q4'] }, series: [
    { name: 'Series A', data: [12, 20, 15, 28] }, { name: 'Series B', data: [8, 14, 19, 21] },
  ] }),
  bar: () => ({ chart: { type: 'bar' }, xAxis: { categories: ['A', 'B', 'C', 'D'] }, series: [{ name: 'Value', data: [12, 20, 15, 28] }] }),
  line: () => ({ chart: { type: 'line' }, xAxis: { categories: ['Jan', 'Feb', 'Mar', 'Apr'] }, series: [{ name: 'Trend', data: [4, 7, 6, 11] }] }),
  area: () => ({ chart: { type: 'area' }, xAxis: { categories: ['Jan', 'Feb', 'Mar', 'Apr'] }, series: [{ name: 'Trend', data: [4, 7, 6, 11] }] }),
  pie: () => ({ chart: { type: 'pie' }, series: [{ name: 'Share', data: [{ name: 'Alpha', y: 42 }, { name: 'Beta', y: 28 }, { name: 'Gamma', y: 30 }] }] }),
  scatter: () => ({ chart: { type: 'scatter' }, series: [{ name: 'Observations', data: [[10, 8], [15, 12], [22, 10], [28, 19]] }] }),
}

/** Convert the supported charts-lite subset, preserving series and axis data. */
export function toHighcharts(input: Record<string, unknown>): ChartOptions {
  const o = input as ChartOptions
  const axes = (value: any) => (Array.isArray(value) ? value : [value ?? {}]).map((a) => ({
    ...(a.type === 'category' ? { categories: a.data ?? [] } : {}),
    ...(a.type === 'log' ? { type: 'logarithmic' } : {}),
    ...(a.name ? { title: { text: a.name } } : {}),
    ...(typeof a.min === 'number' ? { min: a.min } : {}), ...(typeof a.max === 'number' ? { max: a.max } : {}),
    ...(typeof a.axisLabel?.formatter === 'string' ? { labels: { format: a.axisLabel.formatter } } : {}),
  }))
  const series = (Array.isArray(o.series) ? o.series : o.series ? [o.series] : []).map((s: any) => ({
    type: s.type === 'bar' ? 'column' : s.type === 'line' && s.smooth ? 'spline' : s.type || 'column',
    name: s.name,
    data: (s.data ?? []).map((d: any) => {
      if (d && typeof d === 'object' && !Array.isArray(d)) return { ...d, y: d.value ?? d.y, value: undefined }
      return d
    }),
    ...(s.yAxisIndex !== undefined ? { yAxis: s.yAxisIndex } : {}),
    ...(s.stack ? { stack: s.stack, stacking: 'normal' } : {}),
    ...(s.itemStyle?.color || s.lineStyle?.color ? { color: s.itemStyle?.color || s.lineStyle?.color } : {}),
    ...(s.type === 'pie' && Array.isArray(s.radius) ? { innerSize: s.radius[0] } : {}),
  }))
  return JSON.parse(JSON.stringify({
    chart: { type: series[0]?.type ?? 'column', zooming: { type: 'xy' } },
    title: { text: o.title?.text ?? null }, colors: o.colors ?? o.color,
    xAxis: axes(o.xAxis), yAxis: axes(o.yAxis),
    legend: { enabled: !!o.legend && o.legend.show !== false },
    tooltip: { enabled: !!o.tooltip, shared: o.tooltip?.trigger === 'axis' }, series,
  }))
}

/** Highcharts data table for PPTX fallback, retaining tuple/object coordinates. */
export function highchartsDataRows(input: Record<string, unknown>): string[][] {
  const o = input as ChartOptions, categories = axis(o.xAxis).categories ?? []
  const rows = [['Series', 'Category / X', 'Point data (JSON)']]
  for (const [si, s] of (Array.isArray(o.series) ? o.series : []).entries()) {
    for (const [i, point] of (Array.isArray(s.data) ? s.data : []).entries()) {
      const p = own(point)
      const x = p.name ?? categories[i] ?? p.x ?? (Array.isArray(point) ? point[0] : i)
      rows.push([String(s.name ?? `Series ${si + 1}`), String(x), JSON.stringify(point) ?? 'null'])
    }
  }
  return rows
}

/** One-way migration of the old data syntax. No legacy rendering engine ships. */
export function normalizeChartOptions(input: Record<string, unknown>): ChartOptions {
  const o = input as ChartOptions
  const axes = [o.xAxis, o.yAxis].flat().filter(Boolean)
  const series = Array.isArray(o.series) ? o.series : []
  const legacy = o.grid || o.dataZoom || Array.isArray(o.color) ||
    axes.some((a: any) => a.data || a.type === 'value' || a.axisLabel || a.splitLine) ||
    series.some((s: any) => s.itemStyle || s.lineStyle || s.yAxisIndex !== undefined || s.radius ||
      Array.isArray(s.data) && s.data.some((p: any) => p && typeof p === 'object' && !Array.isArray(p) && 'value' in p && !('y' in p)))
  return legacy ? toHighcharts(input) : input
}
