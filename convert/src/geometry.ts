// SPDX-License-Identifier: MIT
// DrawingML guide evaluation and custom paths. Converter-only: no DOM, eval,
// Office runtime or additional dependency is shipped in a saved document.
import { NS, kid, kids, attr, type XElem } from './xml.ts'
export interface GeometryPath { d: string; fill: boolean; stroke: boolean }
const ANGLE = Math.PI / 10800000
const finite = (v: number): number => {
  if (!Number.isFinite(v) || Math.abs(v) > 1e15) throw new Error('invalid geometry number')
  return v
}
export function guideValues(geom: XElem, w: number, h: number): Map<string, number> {
  const ss=Math.min(w,h), values=new Map(Object.entries({w,h,l:0,t:0,r:w,b:h,hc:w/2,vc:h/2,ss,ls:Math.max(w,h),cd2:10800000,cd4:5400000,cd8:2700000,'3cd4':16200000,'3cd8':8100000,'5cd8':13500000,'7cd8':18900000}))
  for(const n of [2,3,4,5,6,8,10,12,16,32]) {
    values.set(`wd${n}`,w/n); values.set(`hd${n}`,h/n); values.set(`ssd${n}`,ss/n)
  }
  const value=(s:string):number=>{
    const v=/^-?\d+(?:\.\d+)?$/.test(s)?Number(s):values.get(s)
    if(v===undefined)throw new Error(`unknown geometry guide: ${s}`)
    return finite(v)
  }
  let budget=4096
  for(const list of ['avLst','gdLst']) for(const gd of kids(kid(geom,NS.a,list) ?? geom,NS.a,'gd')) {
    if(--budget<0)throw new Error('too many geometry guides')
    const name=attr(gd,'name'), [op,...args]=(attr(gd,'fmla')??'').trim().split(/\s+/)
    const arity:Record<string,number>={'val':1,'abs':1,'sqrt':1,'at2':2,'cos':2,'sin':2,'tan':2,'max':2,'min':2,'*/':3,'+-':3,'+/':3,'?:':3,'cat2':3,'sat2':3,'mod':3,'pin':3}
    if(!name||args.length!==arity[op])throw new Error('invalid geometry guide formula')
    const [x,y,z]=args.map(value)
    let v:number
    switch(op) {
      case 'val':v=x;break
      case 'abs':v=Math.abs(x);break
      case 'sqrt':v=Math.sqrt(x);break
      case 'at2':v=Math.atan2(y,x)/ANGLE;break
      case 'cos':v=x*Math.cos(y*ANGLE);break
      case 'sin':v=x*Math.sin(y*ANGLE);break
      case 'tan':v=x*Math.tan(y*ANGLE);break
      case 'max':v=Math.max(x,y);break
      case 'min':v=Math.min(x,y);break
      case '*/':v=x*y/z;break
      case '+-':v=x+y-z;break
      case '+/':v=(x+y)/z;break
      case '?:':v=x>0?y:z;break
      case 'cat2':v=x*Math.cos(Math.atan2(z,y));break
      case 'sat2':v=x*Math.sin(Math.atan2(z,y));break
      case 'mod':v=Math.hypot(x,y,z);break
      case 'pin':v=Math.max(x,Math.min(y,z));break
      default:throw new Error('unsupported geometry formula')
    }
    values.set(name,finite(v))
  }
  return values
}

export function customGeometry(geom:XElem, w:number, h:number, flipH=false, flipV=false):GeometryPath[] {
  if(!(w>0&&h>0))throw new Error('invalid custom geometry extent')
  // Guides are expressed in DrawingML coordinates (EMU), paths may declare
  // their own viewport. Output is always in the element's existing px box.
  const values=guideValues(geom,w*9525,h*9525)
  const value=(s:string|undefined):number=>{
    if(s===undefined)throw new Error('missing geometry coordinate')
    const v=/^-?\d+(?:\.\d+)?$/.test(s)?Number(s):values.get(s)
    if(v===undefined)throw new Error(`unknown geometry coordinate: ${s}`)
    return finite(v)
  }
  const paths=kids(kid(geom,NS.a,'pathLst')??geom,NS.a,'path')
  if(!paths.length||paths.length>64)throw new Error('invalid geometry path count')
  let commands=0,bytes=0
  return paths.map(path=>{
    const pw=attr(path,'w')===undefined?w*9525:value(attr(path,'w'))
    const ph=attr(path,'h')===undefined?h*9525:value(attr(path,'h'))
    if(!(pw>0&&ph>0))throw new Error('invalid geometry path viewport')
    const fill=attr(path,'fill')??'norm'
    if(!['norm','none'].includes(fill))throw new Error(`unsupported geometry fill modifier: ${fill}`)
    const sx=w/pw,sy=h/ph
    const fmt=(n:number)=>String(Math.round(finite(n)*10000)/10000)
    const pair=(x:number,y:number)=>`${fmt(flipH?w-x*sx:x*sx)} ${fmt(flipV?h-y*sy:y*sy)}`
    const out:string[]=[]
    let x=0,y=0,startX=0,startY=0,started=false
    for(const cmd of kids(path)) {
      if(++commands>10000||cmd.ns!==NS.a)throw new Error('invalid or excessive geometry commands')
      const pts=kids(cmd,NS.a,'pt').map(p=>[value(attr(p,'x')),value(attr(p,'y'))])
      if(cmd.local!=='moveTo'&&!started)throw new Error('geometry path must begin with moveTo')
      const arities:Record<string,number>={moveTo:1,lnTo:1,quadBezTo:2,cubicBezTo:3,arcTo:0,close:0}
      if(arities[cmd.local]===undefined||pts.length!==arities[cmd.local])throw new Error('unsupported or malformed geometry command')
      if(cmd.local==='close') {out.push('Z');x=startX;y=startY;continue}
      if(cmd.local==='arcTo') {
        const rx=value(attr(cmd,'wR')),ry=value(attr(cmd,'hR'))
        const start=value(attr(cmd,'stAng'))*ANGLE,sweep=value(attr(cmd,'swAng'))*ANGLE
        if(!(rx>0&&ry>0)||Math.abs(sweep)>2*Math.PI+1e-9)throw new Error('invalid geometry arc')
        // DrawingML angles are polar angles, not ellipse parameter angles.
        const at=(a:number)=>{const t=Math.atan2(rx*Math.sin(a),ry*Math.cos(a));return [rx*Math.cos(t),ry*Math.sin(t)]}
        const p=at(start),cx=x-p[0],cy=y-p[1],n=Math.ceil(Math.abs(sweep)/Math.PI)
        for(let i=1;i<=n;i++) {
          const p=at(start+sweep*i/n);x=cx+p[0];y=cy+p[1]
          const positive=(sweep>0)!==(flipH!==flipV)
          out.push(`A${fmt(rx*sx)} ${fmt(ry*sy)} 0 0 ${positive?1:0} ${pair(x,y)}`)
        }
        continue
      }
      const op={moveTo:'M',lnTo:'L',quadBezTo:'Q',cubicBezTo:'C'}[cmd.local]!
      out.push(op+pts.map(p=>pair(p[0],p[1])).join(' '))
      ;[x,y]=pts[pts.length-1]
      if(cmd.local==='moveTo'){started=true;startX=x;startY=y}
    }
    const d=out.join(' ');bytes+=d.length
    if(!d||bytes>200000)throw new Error('invalid or excessive geometry output')
    return {d,fill:fill!=='none',stroke:!['0','false'].includes(attr(path,'stroke')??'true')}
  })
}
