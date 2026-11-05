// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import { customGeometry, guideValues } from '../../convert/src/geometry.ts'
import { NS, parseXml } from '../../convert/src/xml.ts'
import { convertPptx } from '../../convert/src/pptx.ts'
import { exportPptx } from '../../convert/src/pptx-write/index.ts'
import { geometryFixture } from './_geometry-fixtures.ts'
const geom=(body:string)=>parseXml(`<a:custGeom xmlns:a="${NS.a}">${body}</a:custGeom>`)
const formulas: Array<[string,number]> = [['val 7',7],['abs -7',7],['sqrt 9',3],['at2 0 1',5400000],['cos 10 0',10],['sin 10 cd4',10],['tan 5 0',0],['max 2 3',3],['min 2 3',2],['*/ 3 4 2',6],['+- 3 4 2',5],['+/ 3 5 2',4],['?: -1 4 5',5],['cat2 5 3 4',3],['sat2 5 3 4',4],['mod 3 4 0',5],['pin 1 10 4',4]]
for(const [f,expected] of formulas) assert.ok(Math.abs(guideValues(geom(`<a:gdLst><a:gd name="answer" fmla="${f}"/></a:gdLst>`),100,100).get('answer')!-expected)<1e-6,f)
const g=geom('<a:avLst><a:gd name="adj" fmla="val 25000"/></a:avLst><a:gdLst><a:gd name="x1" fmla="*/ w adj 100000"/></a:gdLst><a:pathLst><a:path><a:moveTo><a:pt x="x1" y="hd2"/></a:moveTo><a:lnTo><a:pt x="r" y="b"/></a:lnTo></a:path></a:pathLst>')
assert.equal(customGeometry(g,200,100)[0].d,'M50 50 L200 100')
assert.equal(customGeometry(g,200,100,true,true)[0].d,'M150 50 L0 0')
for(const f of ['*/ 1 1 0','val missing','sqrt -1','eval 1','val 1 2'])assert.throws(()=>guideValues(geom(`<a:gdLst><a:gd name="a" fmla="${f}"/></a:gdLst>`),1,1))
for(const path of ['<a:path w="0"/>','<a:path><a:lnTo><a:pt x="1" y="1"/></a:lnTo></a:path>','<a:path><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:unsupported/></a:path>'])assert.throws(()=>customGeometry(geom(`<a:pathLst>${path}</a:pathLst>`),100,100))
const imported=await convertPptx(await geometryFixture())
const els=imported.doc.slides[0].elements as any[]
assert.equal(els.length,3)
assert.deepEqual(els.map(e=>e.type),['shape','shape','text'])
assert.equal(els[0].shape,'path');assert.match(els[0].d,/C100 0 300 0 400 100 Q200 300 0 100 Z/)
assert.equal(els[0].strokeWidth,0)
assert.equal(els[1].fill,'transparent');assert.equal(els[1].stroke,'#FF3300')
assert.equal(els[1].d,'M250 100 A50 25 0 0 1 150 100 A50 25 0 0 1 250 100 Z')
assert.equal(new Set(els.map(e=>e.id)).size,3)
assert.equal(new Set(els.map(e=>e.groupId)).size,1)
assert.match(els[2].html,/可编辑文字/)
assert.ok(!imported.report.entries.some(e=>e.code==='shape-approximated'))
const exported=await exportPptx(imported.doc)
const again=await convertPptx(exported.bytes)
assert.equal(again.doc.slides[0].elements.filter(e=>e.type==='shape'&&e.shape==='path').length,2)
assert.ok(!again.report.entries.some(e=>e.code==='shape-approximated'))
const bytes=Buffer.byteLength(JSON.stringify(els))
assert.ok(bytes<12000,`a complex editable object needs only ${bytes} JSON bytes`)
console.log(`DrawingML geometry: 17 formulas, guides, Bezier/arc paths, flips, layers, editable text, PPTX roundtrip; ${bytes} JSON bytes`)
