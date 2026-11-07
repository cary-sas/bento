// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import { buildPptx,slide,XMLNS } from './_fixtures.ts'
import { customShapeXml,complexPaths } from './_geometry-fixtures.ts'
import { convertPptx } from '../../convert/src/pptx.ts'
const dgm='http://schemas.openxmlformats.org/drawingml/2006/diagram',dsp='http://schemas.microsoft.com/office/drawing/2008/diagram'
const rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const frame=(id:string)=>`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Diagram"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="914400" y="457200"/><a:ext cx="7620000" cy="3810000"/></p:xfrm><a:graphic><a:graphicData uri="${dgm}"><dgm:relIds xmlns:dgm="${dgm}" r:dm="data"/></a:graphicData></a:graphic></p:graphicFrame>`
const rels=`<Relationship Id="data" Type="${rel}/diagramData" Target="../diagrams/data.xml"/><Relationship Id="drawing" Type="http://schemas.microsoft.com/office/2007/relationships/diagramDrawing" Target="../diagrams/drawing.xml"/>`
const data=`<dgm:dataModel xmlns:dgm="${dgm}" xmlns:dsp="${dsp}"><dgm:extLst><dgm:ext><dsp:dataModelExt relId="drawing"/></dgm:ext></dgm:extLst></dgm:dataModel>`
const drawing=`<dsp:drawing xmlns:dsp="${dsp}" ${XMLNS}><dsp:spTree><dsp:grpSpPr/>${customShapeXml(complexPaths).replaceAll('p:','dsp:')}</dsp:spTree></dsp:drawing>`
const media={'ppt/diagrams/data.xml':data,'ppt/diagrams/drawing.xml':drawing}
const result=await convertPptx(await buildPptx({slides:[{xml:slide(frame('50')+frame('51')),rels}],media}))
const els=result.doc.slides[0].elements
assert.deepEqual(els.map(e=>e.type),['image','text','image','text'])
assert.equal(new Set(els.map(e=>e.id)).size,4)
assert.equal(els[0].x,192);assert.equal(els[0].y,144)
assert.equal(els[0].groupId,els[1].groupId)
assert.notEqual(els[0].groupId,els[2].groupId)
assert.equal(Object.keys(result.doc.assets).length,1,'identical diagram backgrounds reuse one asset')
assert.ok(result.report.entries.some(e=>e.code==='diagram-cached-layout'))
for(const variant of [{...media,'ppt/diagrams/drawing.xml':''},{...media,'ppt/diagrams/data.xml':data.replace('relId="drawing"','relId="missing"')}]){
 const bad=await convertPptx(await buildPptx({slides:[{xml:slide(frame('50')),rels}],media:variant}))
 assert.ok(bad.report.entries.some(e=>e.code==='diagram-import-unsupported'))
 assert.equal(bad.doc.slides[0].elements.length,1,'failure is an atomic marked placeholder')
}
console.log('SmartArt cache: drawing routing, image/text separation, offsets, instance IDs, resource reuse and missing-cache reporting passed')
