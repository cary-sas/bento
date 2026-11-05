// SPDX-License-Identifier: MIT
// Highcharts is the only chart renderer in this fork.
import { highchartsSnapshot, mountHighcharts } from './highcharts'
import { normalizeChartOptions } from './highcharts-options'
export { HIGHCHARTS_PRESETS as CHART_PRESETS, HIGHCHARTS_PRESETS } from './highcharts-options'
export interface ChartInput { w: number; h: number; option: Record<string, unknown> }
export function chartSnapshotSvg(el: ChartInput): string {
  return highchartsSnapshot({ ...el, option: normalizeChartOptions(el.option) })
}
export function mountChart(el: ChartInput, host: HTMLElement, fromOption?: Record<string, unknown>, durationMs = 600): () => void {
  return mountHighcharts({ ...el, option: normalizeChartOptions(el.option) }, host,
    fromOption && normalizeChartOptions(fromOption), durationMs)
}
