// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import { exportPptx } from '../../convert/src/pptx-write/index.ts'
import { convertPptx } from '../../convert/src/pptx.ts'
import { readZip } from '../../kernel/src/convert/zip.ts'
import { packageProblems } from '../../convert/src/pptx-write/verify.ts'
import { deck, frame } from './_export-harness.ts'
import type { OutChart } from '../../convert/src/types.ts'

async function roundtrip(option: Record<string, unknown>) {
  const r = await exportPptx(deck([{id:'c',type:'chart',preset:'column',...frame(96,48,960,480),option}]))
  const parts = await readZip(r.bytes)
  assert.deepEqual(packageProblems(parts),[])
  return {output:r,parts,doc:(await convertPptx(r.bytes)).doc,
    chart:new TextDecoder().decode(parts.get('ppt/charts/chart1.xml'))}
}
for (const type of ['column','bar','line','spline','area','pie','scatter']) {
  const data = type==='scatter'?[[0,12],[5,null],[20,-4.25]]:type==='pie'?[{name:'基线',y:12},{name:'第2周',y:null},{name:'第4周',y:4.25}]:[12,null,-4.25]
  const r = await roundtrip({chart:{type},xAxis:{categories:type==='scatter'?undefined:['基线','第2周','第4周']},
    yAxis:{min:-10,max:20},series:[{name:'治疗组 A',data,color:'#123456'}],legend:{enabled:true}})
  assert.ok(r.parts.has('ppt/charts/chart1.xml'),`${type} is native`)
  assert.ok(r.output.report.entries.some(e=>e.code==='highcharts-native-chart'))
  const c = r.doc.slides[0].elements[0] as OutChart
  assert.equal(c.type,'chart',`${type} reimports as a chart`)
  const opt = c.option as any
  assert.deepEqual(type==='pie'?opt.series[0].data.map(({color,...p}: any)=>p):opt.series[0].data,data)
  if(type!=='pie') assert.equal(opt.series[0].color,'#123456',type)
  assert.equal(opt.series[0].name,'治疗组 A')
  if(type==='bar') { assert.match(r.chart,/<c:barDir val="bar"/);assert.match(r.chart,/<c:axPos val="b"/)}
  // Missing point 1 is absent from the numeric cache, not present with 0.
  assert.doesNotMatch(r.chart,/<c:pt idx="1"><c:v>0<\/c:v>/)
}
const xy = await roundtrip({chart:{type:'line'},xAxis:{min:0,max:30},series:[{data:[[0,5],[12,null],[30,-2]]}]})
assert.match(xy.chart,/<c:scatterChart>/)
assert.doesNotMatch(xy.chart,/<a:noFill\/>/)
assert.deepEqual(((xy.doc.slides[0].elements[0] as OutChart).option as any).series[0].data,[[0,5],[12,null],[30,-2]])
const spaced = await roundtrip({chart:{type:'line'},series:[{pointStart:5,pointInterval:10,data:[1,2,3]}]})
assert.deepEqual(((spaced.doc.slides[0].elements[0] as OutChart).option as any).series[0].data,[[5,1],[15,2],[25,3]])
const combo = await roundtrip({xAxis:{categories:['A','B']},yAxis:[{},{}],series:[
  {type:'column',name:'Count',data:[12,15]}, {type:'line',name:'Rate',yAxis:1,data:[1.2,2.4]}]})
assert.match(combo.chart,/<c:barChart>/)
assert.match(combo.chart,/<c:lineChart>/)
assert.equal(((combo.doc.slides[0].elements[0] as OutChart).option as any).series[1].yAxis,1)
const pie = await roundtrip({chart:{type:'pie'},plotOptions:{pie:{innerSize:'40%'}},series:[{data:[['A',1],['B',2]]}]})
assert.match(pie.chart,/<c:holeSize val="40"/)
for(const option of [
  {chart:{type:'waterfall'},series:[{data:[{y:2},{isSum:true}]}]},
  {chart:{type:'column'},series:[{stacking:'normal',data:[1,2]}]},
  {chart:{type:'xrange'},series:[{data:[{x:1,x2:5,y:0}]}]},
  {chart:{type:'boxplot'},series:[{data:[[1,2,3,4,5]]}]},
  {chart:{type:'column'},series:[{data:[false]}]},
  {chart:{type:'column'},series:[{data:[[10,20]]}]},
]) {
  const r = await roundtrip(option)
  assert.ok(!r.parts.has('ppt/charts/chart1.xml'))
  assert.ok(r.output.report.entries.some(e=>e.code==='highcharts-as-data-table'))
}
console.log('Highcharts native PPTX export: 7 chart types, sparse nulls, XY line, intervals, combo, donut, package wiring and full-data fallback passed')
