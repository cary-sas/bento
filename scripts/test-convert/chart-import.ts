// SPDX-License-Identifier: MIT
// @bundle
import assert from 'node:assert/strict'
import { convertPptx } from '../../convert/src/pptx.ts'
import { parseDoc } from '../../slides/src/model.ts'
import { chartFixture, chartXml, seriesXml, graphicFrame, cacheXml } from './_chart-import-fixtures.ts'
import { buildPptx, slide } from './_fixtures.ts'
import type { OutChart, OutTable } from '../../convert/src/types.ts'

const imported = await convertPptx(await chartFixture())
const chart = imported.doc.slides[0].elements[0] as OutChart
assert.equal(chart.type, 'chart')
assert.deepEqual([chart.x, chart.y, chart.w, chart.h], [96, 48, 960, 480])
const option = chart.option as any
assert.equal(option.chart.type, 'column')
assert.equal(option.title.text, '变化趋势')
assert.deepEqual(option.xAxis.categories, ['基线', '第2周', '第4周'])
assert.deepEqual(option.series[0].data, [12, null, -4.25])
assert.equal(option.series[0].color, '#123456')
assert.equal(option.series[0].name, '治疗组 A')
assert.equal(option.yAxis[0].min, -10)
assert.ok(imported.report.entries.some(e => e.code === 'chart-imported-from-cache'))
assert.equal(parseDoc(JSON.stringify(imported.doc))!.slides[0].elements[0].type, 'chart')

for (const [kind, type] of [['lineChart','line'], ['areaChart','area'], ['pieChart','pie'], ['doughnutChart','pie'], ['scatterChart','scatter']]) {
  const r = await convertPptx(await chartFixture(chartXml(kind, seriesXml(kind === 'scatterChart'))))
  const el = r.doc.slides[0].elements[0] as OutChart
  assert.equal(el.type, 'chart', JSON.stringify(r.report))
  assert.equal((el.option as any).series[0].type, type)
  if (type === 'scatter') assert.deepEqual((el.option as any).series[0].data, [[0,12],[5,null],[20,-4.25]])
  if (type === 'pie') assert.deepEqual((el.option as any).series[0].data[1], {name:'第2周',y:null})
  if (kind === 'doughnutChart') assert.equal((el.option as any).series[0].innerSize, '50%')
}
for (const xml of [chartXml('bar3DChart'), chartXml().replace('<c:ptCount val="3"/>','<c:ptCount val="9999999"/>'),
  chartXml().replace('>-4.25<','>NaN<'), chartXml().replace('idx="2"','idx="0"'),
  chartXml().replace(cacheXml('num',[12,null,-4.25]), '<c:numRef><c:f>External!A1</c:f></c:numRef>')]) {
  const r = await convertPptx(await chartFixture(xml))
  assert.equal(r.doc.slides[0].elements[0].type,'shape')
  assert.ok(r.report.entries.some(e=>e.code==='chart-import-unsupported'))
}
const external = await convertPptx(await chartFixture(chartXml(), 'TargetMode="External"'))
assert.equal(external.doc.slides[0].elements[0].type, 'shape')
assert.ok(external.report.entries.some(e => e.code === 'chart-part-missing'))
const stacked = await convertPptx(await chartFixture(chartXml().replace('val="clustered"','val="percentStacked"')))
assert.equal(((stacked.doc.slides[0].elements[0] as OutChart).option as any).series[0].stacking,'percent')

const cell = (text: string, props = '') => `<a:tc ${props}><a:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1800" b="1"/><a:t>${text}</a:t></a:r></a:p></a:txBody><a:tcPr><a:solidFill><a:srgbClr val="AABBCC"/></a:solidFill></a:tcPr></a:tc>`
const tableXml = '<a:tbl><a:tblPr firstRow="1"/><a:tblGrid><a:gridCol w="914400"/><a:gridCol w="1828800"/></a:tblGrid>' +
  `<a:tr h="457200">${cell('标题 &lt;A&gt;')}${cell('值')}</a:tr><a:tr h="914400">${cell('数据','gridSpan="2"')}${cell('12','hMerge="1"')}</a:tr></a:tbl>`
const tables = await convertPptx(await buildPptx({slides:[{xml:slide(graphicFrame(tableXml))}]}))
const table = tables.doc.slides[0].elements[0] as OutTable
assert.equal(table.type, 'table')
assert.equal(table.header, true)
assert.deepEqual(table.columns, [{w:96},{w:192}])
assert.match(table.rows[0].cells[0].html, /标题 &lt;A&gt;/)
assert.equal(table.rows[0].cells[0].bg, '#AABBCC')
assert.equal(table.rows[0].cells[0].bold, true)
assert.equal(table.style?.fontSize,24)
assert.equal(parseDoc(JSON.stringify(tables.doc))!.slides[0].elements[0].type, 'table')
assert.ok(tables.report.entries.some(e=>e.code==='table-merges-flattened'))
assert.ok(tables.report.entries.some(e=>e.code==='table-row-heights-equalized'))
console.log('PPTX editable chart and table import: data, nulls, rel routing, limits, refusal and loadability passed')
