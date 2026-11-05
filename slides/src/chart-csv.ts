// SPDX-License-Identifier: MIT
import type { ChartOptions } from './highcharts-options'
export interface CsvSettings { delimiter?: ',' | ';' | '\t'; header?: boolean; mode?: 'category' | 'xy' }
export class ChartCsvError extends Error {}

/** RFC 4180 quoting, including doubled quotes and embedded CR/LF. */
export function parseChartCsv(text: string, delimiter?: string): string[][] {
  if (text.length > 2 * 1024 * 1024) throw new ChartCsvError('CSV exceeds 2 MiB')
  text = text.replace(/^\uFEFF/, '')
  if (!delimiter) {
    const counts = new Map([[',', 0], [';', 0], ['\t', 0]])
    let quoted = false
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (c === '"') { if (quoted && text[i + 1] === '"') i++; else quoted = !quoted }
      else if (!quoted && /[\r\n]/.test(c)) break
      else if (!quoted && counts.has(c)) counts.set(c, counts.get(c)! + 1)
    }
    delimiter = [...counts].sort((a, b) => b[1] - a[1])[0][0]
  }
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false, closed = false
  const pushField = () => { if (field.length > 4096) throw new ChartCsvError('CSV field exceeds 4096 characters'); row.push(field); field = ''; closed = false; if (row.length > 50) throw new ChartCsvError('CSV has more than 50 columns') }
  const pushRow = () => { pushField(); if (row.some((v) => v.trim())) rows.push(row); row = []; if (rows.length > 2001) throw new ChartCsvError('CSV has more than 2000 data rows') }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else { quoted = false; closed = true } }
      else field += c
    } else if (c === delimiter) pushField()
    else if (c === '\r' || c === '\n') { pushRow(); if (c === '\r' && text[i + 1] === '\n') i++ }
    else if (c === '"' && !field && !closed) quoted = true
    else if (closed && !/\s/.test(c)) throw new ChartCsvError('Unexpected text after a quoted CSV field')
    else if (!closed) field += c
  }
  if (quoted) throw new ChartCsvError('Unclosed quoted CSV field')
  if (field || row.length || closed) pushRow()
  if (!rows.length) throw new ChartCsvError('CSV is empty')
  const width = rows[0].length
  if (width < 2) throw new ChartCsvError('CSV needs a category/X column and at least one numeric column')
  if (rows.some((r) => r.length !== width)) throw new ChartCsvError('CSV rows have different column counts')
  return rows
}
function number(value: string, row: number, col: number): number | null {
  let s = value.trim()
  if (!s || /^(?:NA|N\/A|null)$/i.test(s)) return null
  if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?%?$/.test(s)) s = s.replace(/,/g, '')
  s = s.replace(/%$/, '')
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s) || !Number.isFinite(Number(s)))
    throw new ChartCsvError(`Non-numeric data at row ${row}, column ${col}: ${value.slice(0, 40)}`)
  return Number(s)
}
export function csvToHighcharts(current: ChartOptions, text: string, settings: CsvSettings = {}): ChartOptions {
  const rows = parseChartCsv(text, settings.delimiter)
  const header = settings.header !== false ? rows.shift()! : null
  if (!rows.length) throw new ChartCsvError('CSV has no data rows')
  const type = current.chart?.type ?? 'column'
  if (!['column', 'bar', 'line', 'spline', 'area', 'areaspline', 'scatter', 'pie', 'waterfall'].includes(type))
    throw new ChartCsvError('CSV import supports column, bar, line, area, scatter, pie and waterfall charts. Select one of these types first.')
  if (type === 'pie' && rows[0].length !== 2) throw new ChartCsvError('Pie CSV requires exactly two columns: name and value')
  const xy = settings.mode === 'xy'
  const axis = Array.isArray(current.xAxis) ? (current.xAxis[0] ?? {}) : (current.xAxis ?? {})
  const nextAxis = { ...axis }
  if (xy) { delete nextAxis.categories; if (nextAxis.type === 'category') delete nextAxis.type }
  else { nextAxis.categories = rows.map((r) => r[0]); delete nextAxis.type }
  const series = Array.from({ length: rows[0].length - 1 }, (_, index) => {
    const prior = current.series?.[index] ?? {}, ci = index + 1
    return { ...prior, name: header?.[ci] || `Series ${ci}`, data: rows.map((r, ri) => {
      const y = number(r[ci], ri + (header ? 2 : 1), ci + 1)
      if (type === 'pie') return { name: r[0], y }
      if (!xy) return y
      const x = number(r[0], ri + (header ? 2 : 1), 1)
      if (x === null) throw new ChartCsvError(`Missing X at row ${ri + (header ? 2 : 1)}`)
      return [x, y]
    }) }
  })
  if (series.reduce((n, s) => n + s.data.length * (xy ? 3 : 1), 0) > 12000)
    throw new ChartCsvError('CSV has too many values; split the data into smaller charts')
  return { ...current, xAxis: Array.isArray(current.xAxis) ? [nextAxis, ...current.xAxis.slice(1)] : nextAxis, series }
}
