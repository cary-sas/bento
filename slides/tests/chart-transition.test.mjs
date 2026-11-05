// SPDX-License-Identifier: MIT
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chartTransitionData } from '../src/chart-transition.ts'
const chart = data => ({chart:{type:'column'},xAxis:{categories:['A','B']},yAxis:{min:0,max:30},series:[{name:'Arm A',data}]})
test('transition keeps stable category, XY and object identities',()=>{
  assert.deepEqual(chartTransitionData(chart([1,2]),chart([10,20])),[[1,2]])
  assert.deepEqual(chartTransitionData(chart([[0,1],[5,2]]),chart([[0,10],[5,20]])),[[[0,1],[5,2]]])
  assert.deepEqual(chartTransitionData(chart([{name:'A',y:1},null]),chart([{name:'A',y:10},null])),[[{name:'A',y:1},null]])
})
test('topology, coordinates, names, null gaps and styles cannot interpolate across mismatches',()=>{
  const source=chart([1,2])
  for(const target of [chart([1]),chart([null,2]),{...chart([2,3]),chart:{type:'pie'}},
    {...chart([2,3]),xAxis:{categories:['B','A']}}, {...chart([2,3]),series:[{name:'Arm B',data:[2,3]}]},
    chart([false,2])]) assert.equal(chartTransitionData(source,target),undefined)
  assert.equal(chartTransitionData(chart([[0,1],[5,2]]),chart([[1,10],[5,20]])),undefined)
  assert.equal(chartTransitionData(chart([{name:'A',y:1}]),chart([{name:'B',y:2}])),undefined)
  assert.equal(chartTransitionData({...source,chart:{type:'boxplot'}},{...source,chart:{type:'boxplot'}}),undefined)
})
