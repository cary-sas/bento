// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import { PRESET_DATA } from '../../convert/src/preset-data.ts'
import { presetDefinition } from '../../convert/src/presets.ts'
import { customGeometry } from '../../convert/src/geometry.ts'
import { parseXml, NS } from '../../convert/src/xml.ts'
const preset=(name:string,adjust='')=>presetDefinition(parseXml(`<a:prstGeom xmlns:a="${NS.a}" prst="${name}"><a:avLst>${adjust}</a:avLst></a:prstGeom>`))!
assert.equal(Object.keys(PRESET_DATA).length,187)
for(const name of Object.keys(PRESET_DATA)) for(const [w,h] of [[200,100],[100,200],[100,100]]) {
  const paths=customGeometry(preset(name),w,h)
  assert.ok(paths.length>0,name)
  for(const p of paths) assert.ok(!/NaN|Infinity/.test(p.d),name)
}
assert.equal(customGeometry(preset('rect'),200,100)[0].d,'M0 0 L200 0 L200 100 L0 100 Z')
const before=customGeometry(preset('chevron'),200,100)[0].d
const adjusted=customGeometry(preset('chevron','<a:gd name="adj" fmla="val 25000"/>'),200,100)[0].d
assert.notEqual(before,adjusted)
assert.equal(customGeometry(preset('chevron'),200,100)[0].d,before,'instance adjustments must not mutate cached defaults')
assert.equal(preset('__proto__'),undefined)
console.log('187 presets × 3 aspect ratios; rectangle golden path, per-instance adjustments and cache isolation passed')
