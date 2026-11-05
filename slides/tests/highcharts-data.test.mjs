// SPDX-License-Identifier: MIT
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseChartCsv, csvToHighcharts } from '../src/chart-csv.ts'
import { HIGHCHARTS_PRESETS, normalizeChartOptions, highchartsDataRows } from '../src/highcharts-options.ts'
import { Report } from '../../convert/src/report.ts'
import { chartExport } from '../../convert/src/pptx-write/charts.ts'
import { serialize } from '../../convert/src/xmlout.ts'

test('CSV supports BOM, CRLF, embedded newlines, commas and doubled quotes', () => {
  assert.deepEqual(parseChartCsv('\uFEFFName,A,B\r\n"Site, one",1,2\r\n"Site ""two""\n二",3,4\r\n'), [
    ['Name','A','B'],['Site, one','1','2'],['Site "two"\n二','3','4'],
  ])
  assert.deepEqual(parseChartCsv('Category;A\n一;2'), [['Category','A'],['一','2']])
  assert.deepEqual(parseChartCsv('Category\tA\n二\t3'), [['Category','A'],['二','3']])
})
test('CSV categories, missing values, percentages and quoted thousands', () => {
  const o = csvToHighcharts({ ...HIGHCHARTS_PRESETS.column(), colors: ['red'] }, 'Site,A,B\n一,"1,200",35%\n二,NA,-1.2e2')
  assert.deepEqual(o.xAxis.categories, ['一','二'])
  assert.deepEqual(o.series.map((s) => s.data), [[1200,null],[35,-120]])
  assert.deepEqual(o.colors, ['red'])
})
test('numeric XY and pie keep native Highcharts point shapes', () => {
  const o = csvToHighcharts(HIGHCHARTS_PRESETS.scatter(), 'Time,A,B\n0,10,20\n5,9,', { mode: 'xy' })
  assert.deepEqual(o.series[1].data, [[0,20],[5,null]])
  assert.equal(o.xAxis.categories, undefined)
  const pie = csvToHighcharts(HIGHCHARTS_PRESETS.pie(), 'Name,Y\n一,42\n二,58')
  assert.deepEqual(pie.series[0].data, [{name:'一',y:42},{name:'二',y:58}])
  const nohead = csvToHighcharts(HIGHCHARTS_PRESETS.line(), 'a,1\nb,2', { header:false })
  assert.equal(nohead.series[0].name,'Series 1'); assert.deepEqual(nohead.series[0].data,[1,2])
})
test('invalid CSV never silently becomes zero or a partial chart', () => {
  for (const text of ['', 'A', 'A,B\n"oops,1', 'A,B\na,1,2']) assert.throws(() => parseChartCsv(text))
  assert.throws(() => csvToHighcharts({},'A,B\na,not-a-number'), /Non-numeric/)
  assert.throws(() => csvToHighcharts({},'A,B\n,2',{mode:'xy'}), /Missing X/)
  assert.throws(() => csvToHighcharts(HIGHCHARTS_PRESETS.pie(),'A,B,C\na,1,2'), /exactly two/)
  assert.throws(() => parseChartCsv('x'.repeat(2*1048576+1)), /2 MiB/)
})
test('one-way data migration keeps dual axes, labels, colours and pie values', () => {
  const old = { color:['#123456'], xAxis:{type:'category',data:['a','b']}, yAxis:[{type:'value'},{type:'value'}],
    series:[{type:'bar',data:[2,3],yAxisIndex:1}], tooltip:{trigger:'axis'} }
  const o = normalizeChartOptions(old)
  assert.equal(o.series[0].type,'column'); assert.deepEqual(o.xAxis[0].categories,['a','b']); assert.equal(o.series[0].yAxis,1)
  assert.deepEqual(o.colors,['#123456']); assert.equal(normalizeChartOptions(o),o)
  const pie = normalizeChartOptions({series:[{type:'pie',radius:['30%','70%'],data:[{name:'A',value:4}]}]})
  assert.deepEqual(pie.series[0].data,[{name:'A',y:4}])
})
test('PPTX data-table export preserves object and tuple points without inventing a native chart', () => {
  const option = {chart:{type:'xrange'},series:[{name:'Cohort <A>',data:[{x:1,x2:5,y:0},[2,3],null]}]}
  const rows = highchartsDataRows(option)
  assert.equal(rows[1][2],'{"x":1,"x2":5,"y":0}')
  const report = new Report()
  const result = chartExport({id:'c',type:'chart',preset:'bar',x:0,y:0,w:800,h:400,rotation:0,opacity:1,option},2,'rId1',[],report,'slide 1')
  assert.equal(result.chartXml,undefined)
  assert.match(serialize(result.frame),/x2/)
  assert.match(serialize(result.frame),/Cohort &lt;A&gt;/)
  assert.ok(report.build().entries.some((e)=>e.code==='highcharts-as-data-table'))
})
