// SPDX-License-Identifier: MIT
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { HIGHCHARTS_PRESETS } from '../src/highcharts-options.ts'
import { csvToHighcharts } from '../src/chart-csv.ts'
const require = createRequire(import.meta.url)
const { buildSync } = require('../node_modules/esbuild')
test('the browser dependency graph contains Core without the removed optional modules or Stock',()=>{
  const result=buildSync({entryPoints:[fileURLToPath(new URL('../src/highcharts.ts',import.meta.url))],
    bundle:true,platform:'browser',format:'esm',write:false,metafile:true,logLevel:'silent'})
  const paths=Object.keys(result.metafile.inputs).map(p=>p.replaceAll('\\','/'))
  assert.ok(paths.some(p=>p.endsWith('masters/highcharts.src.js')))
  const forbidden=/highcharts\/es-modules\/(?:Stock\/|Accessibility\/|Extensions\/Exporting\/|Series\/(?:XRange|BoxPlot|Waterfall)\/|masters\/(?:highcharts-more|modules\/(?:xrange|exporting|accessibility)))/
  assert.deepEqual(paths.filter(p=>forbidden.test(p)),[])
})
test('only the six selected Core presets are offered and CSV cannot recreate removed chart types',()=>{
  assert.deepEqual(Object.keys(HIGHCHARTS_PRESETS),['column','bar','line','area','pie','scatter'])
  for(const type of ['waterfall','boxplot','xrange']) assert.throws(()=>csvToHighcharts({chart:{type}},'X,Y\na,1'))
})
