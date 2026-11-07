// SPDX-License-Identifier: MIT
import { NS, kid, kids, attr, descendants, type XElem } from './xml.ts'
import type { Rel } from './media.ts'
import type { GroupFrame } from './shapes.ts'
export const DGM = 'http://schemas.openxmlformats.org/drawingml/2006/diagram'
const DSP = 'http://schemas.microsoft.com/office/drawing/2008/diagram'
const el=(local:string,attrs:Record<string,string>,children:XElem[]=[]):XElem=>({name:'a:'+local,local,ns:NS.a,attrs:new Map(Object.entries(attrs)),children})
/** Read the producer's cached SmartArt drawing. No layout guessing or raster
 * fallback with baked-in labels: only an explicit drawing relationship. */
export function diagramGroup(gd:XElem,rels:Map<string,Rel>,xml:(name:string)=>XElem|undefined,frame:GroupFrame,id:string):XElem {
  const refs=kid(gd,DGM,'relIds'), dm=refs&&rels.get(attr(refs,'dm')??'')
  if(!dm||dm.mode||!dm.type.endsWith('/diagramData'))throw new Error('missing internal diagram data relationship')
  const data=xml(dm.target)
  const ext=data&&descendants(data,DSP,'dataModelExt')[0]
  const drawing=ext&&rels.get(attr(ext,'relId')??'')
  if(!drawing||drawing.mode||!drawing.type.endsWith('/diagramDrawing'))throw new Error('missing cached diagram drawing relationship')
  const root=xml(drawing.target),tree=root&&kid(root,DSP,'spTree')
  if(!tree)throw new Error('missing cached drawing tree')
  let budget=20000
  const ids=new Set<string>()
  const clone=(node:XElem,depth=0):XElem=>{
    if(--budget<0||depth>32)throw new Error('diagram exceeds complexity limit')
    // Image/hyperlink relationships belong to the drawing part, not the slide.
    // Refuse until that owner is routed rather than accidentally reading a slide asset.
    if(node.ns===NS.a&&['blip','hlinkClick','hlinkMouseOver'].includes(node.local))throw new Error('cached drawing media relationships not yet supported')
    const copy={...node,attrs:new Map(node.attrs),children:node.children.map(c=>typeof c==='string'?c:clone(c,depth+1))}
    if(node.ns===DSP){copy.ns=NS.p;copy.name='p:'+node.local}
    if(node.local==='cNvPr'){
      const old=attr(node,'id');if(!old||ids.has(old))throw new Error('missing or duplicate diagram shape id');ids.add(old)
      copy.attrs.set('id',`diagram-${id}-${old}`)
    }
    if(node.ns===NS.a&&['stCxn','endCxn'].includes(node.local))copy.attrs.set('id',`diagram-${id}-${attr(node,'id')}`)
    return copy
  }
  const group=clone(tree);group.local='grpSp';group.name='p:grpSp'
  const props=kid(group,NS.p,'grpSpPr'),xf=props&&kid(props,NS.a,'xfrm')
  if(xf&&(Number(attr(xf,'rot')??0)!==0||['1','true'].includes(attr(xf,'flipH')??'')||['1','true'].includes(attr(xf,'flipV')??'')))throw new Error('transformed cached root not yet supported')
  const size=(xf&&kid(xf,NS.a,'chExt'))??(xf&&kid(xf,NS.a,'ext'))
  const w=size?Number(attr(size,'cx')):frame.w,h=size?Number(attr(size,'cy')):frame.h
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw new Error('invalid cached drawing extent')
  const chOff=(xf&&kid(xf,NS.a,'chOff'))??el('chOff',{x:'0',y:'0'})
  const transform=el('xfrm',{rot:String(frame.rotation*60000),flipH:frame.flipH?'1':'0',flipV:frame.flipV?'1':'0'},[
    el('off',{x:String(frame.x),y:String(frame.y)}),el('ext',{cx:String(frame.w),cy:String(frame.h)}),chOff,el('chExt',{cx:String(w),cy:String(h)})])
  const pr:XElem={name:'p:grpSpPr',local:'grpSpPr',ns:NS.p,attrs:new Map(),children:[transform]}
  group.children=group.children.filter(c=>typeof c==='string'||c!==props);group.children.unshift(pr)
  if(!kids(group,NS.p).some(c=>['sp','grpSp','cxnSp'].includes(c.local)))throw new Error('empty cached diagram')
  return group
}
