// SPDX-License-Identifier: MIT
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { exportPptx } from '../../convert/src/pptx-write/index.ts'
import { convertPptx } from '../../convert/src/pptx.ts'
import { chartFixture } from '../../scripts/test-convert/_chart-import-fixtures.ts'
import { HIGHCHARTS_PRESETS } from '../src/highcharts-options.ts'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const root = fileURLToPath(new URL('../../', import.meta.url))
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bento-highcharts-'))
const html = await fs.readFile(path.join(root, 'slides/dist-single/Bento_Slides.bento.html'), 'utf8')
const block = '<script type="application/bento+json" id="bento-doc">', close = '</'+'script>'
const start = html.indexOf(block)+block.length, end=html.indexOf(close,start)
const doc = (option) => ({format:'bento/slides',version:1,title:'Highcharts CSV demo',size:{width:1280,height:720},
  theme:{background:'#fff',color:'#172a3a',accent:'#3366aa',fontFamily:'Arial'},
  slides:[{id:'s',name:'Chart',background:'#fff',transition:'none',notes:'',elements:[{
    id:'chart',type:'chart',x:100,y:100,w:1000,h:500,rotation:0,opacity:1,preset:'column',option,
  }]}]})
const file=path.join(temp,'demo.bento.html')
await fs.writeFile(file,html.slice(0,start)+JSON.stringify(doc(HIGHCHARTS_PRESETS.column())).replace(/</g,'\\u003c')+html.slice(end))
const browser=await chromium.launch({headless:true})
try {
  const ctx=await browser.newContext({viewport:{width:1440,height:1000}})
  await ctx.addInitScript(()=>localStorage.setItem('bento-lang','en'))
  const external=[]
  await ctx.route(/^https?:/,route=>{external.push(route.request().url());return route.abort()})
  const p=await ctx.newPage(), errors=[]
  p.on('pageerror',e=>errors.push(e.message))
  await p.goto(pathToFileURL(file).href)
  await p.waitForFunction(()=>window.bento?.doc?.title==='Highcharts CSV demo')
  for(const [type,make] of Object.entries(HIGHCHARTS_PRESETS)) {
    const report=await p.evaluate(json=>window.bento.loadDoc(json),JSON.stringify(doc(make())))
    assert.notEqual(report,false)
    const node=p.locator('.ed-stage-scale [data-el-id="chart"]')
    await node.locator('svg.highcharts-root').waitFor()
    assert.ok(await node.locator('.highcharts-point').count()>0,`${type} has rendered points`)
    assert.doesNotMatch(await node.textContent(),/Highcharts:|undefined|NaN/)
    console.log(`Rendered ${type}`)
  }
  const raster = await p.locator('.ed-stage-scale svg.highcharts-root').evaluate(async svg=>{
    const xml=new XMLSerializer().serializeToString(svg)
    const url=URL.createObjectURL(new Blob([xml],{type:'image/svg+xml'}))
    try {
      const image=new Image();image.src=url;await image.decode()
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0)
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data
      let ink=0
      for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>0&&(pixels[i]<200||pixels[i+1]<200||pixels[i+2]<200))ink++
      return {width:canvas.width,height:canvas.height,ink}
    } finally { URL.revokeObjectURL(url) }
  })
  assert.ok(raster.width>0&&raster.height>0&&raster.ink>500,'Core SVG snapshot decodes and rasterizes without exporting')
  await p.evaluate(json=>window.bento.loadDoc(json),JSON.stringify(doc(HIGHCHARTS_PRESETS.column())))
  await p.locator('.ed-stage-scale [data-el-id="chart"]').click({position:{x:25,y:25}})
  await p.getByLabel('CSV data',{exact:true}).waitFor()
  const csv=path.join(temp,'中文.csv')
  await fs.writeFile(csv,'\uFEFFVisit,Arm A,Arm B\r\n"第1周,基线",12,18\r\n第2周,15,NA\r\n')
  await p.getByLabel('CSV file',{exact:true}).setInputFiles(csv)
  await p.waitForFunction(()=>document.querySelector('.ed-chart-csv')?.value.includes('第2周'))
  await p.getByRole('button',{name:'Apply CSV data',exact:true}).click()
  await p.waitForFunction(()=>window.bento.doc.slides[0].elements[0].option.series[0].data[1]===15)
  const imported=await p.evaluate(()=>window.bento.doc.slides[0].elements[0].option)
  assert.deepEqual(imported.xAxis.categories,['第1周,基线','第2周'])
  assert.deepEqual(imported.series[1].data,[18,null])
  // No-header toggle and numeric XY pasted input are independent of file import.
  await p.getByLabel('CSV data',{exact:true}).fill('0,1\n5,4')
  await p.getByLabel('First row contains headers',{exact:true}).uncheck()
  await p.getByLabel('CSV interpretation',{exact:true}).selectOption('xy')
  await p.getByRole('button',{name:'Apply CSV data',exact:true}).click()
  assert.deepEqual(await p.evaluate(()=>window.bento.doc.slides[0].elements[0].option.series[0].data),[[0,1],[5,4]])
  await p.getByText('Advanced (JSON)',{exact:true}).click()
  const native={chart:{type:'line'},title:{text:'Native configuration'},plotOptions:{series:{marker:{enabled:true}}},series:[{name:'Value',data:[2,6,3]}],tooltip:{pointFormat:'Value: {point.y}'}}
  await p.locator('.ed-chart-json').fill(JSON.stringify(native));await p.locator('.ed-chart-json').press('Tab')
  await p.waitForFunction(()=>window.bento.doc.slides[0].elements[0].option.title.text==='Native configuration')
  // Present in tab: hover on actual Highcharts hit targets, toggle a series.
  await p.locator('.ed-pill-caret').click()
  await p.getByRole('button',{name:'Present in this tab',exact:true}).click()
  const live=p.locator('.bento-present-overlay [data-el-id="chart"]')
  await p.waitForFunction(()=>document.querySelector('.bento-present-overlay [data-el-id=\"chart\"]')?.hasAttribute('data-highcharts-chart'))
  await live.locator('.highcharts-series-group .highcharts-point').first().waitFor()
  const target = live.locator('.highcharts-series-group .highcharts-point').first()
  await target.hover()
  // Highcharts builds a line series' KD tree asynchronously on the first
  // pointer query. Real hover includes continued movement after that query.
  const box = await target.boundingBox()
  await p.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2, { steps: 4 })
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
  try {
    await p.waitForFunction(()=>[...document.querySelectorAll('.highcharts-tooltip')].some(e=>e.getAttribute('visibility')!=='hidden'),null,{timeout:10000})
  } catch(error) {
    console.log('Tooltip diagnostic',JSON.stringify(await live.evaluate(el=>({html:el.innerHTML.slice(-1000),chart:[...el.querySelectorAll('.highcharts-series-group .highcharts-point')].slice(0,1).map(p=>{const c=p.point?.series?.chart;return c?{tooltip:c.options.tooltip,position:c.pointer.chartPosition,hover:c.hoverPoint?.y}:null}),rect:el.getBoundingClientRect().toJSON(),attr:el.getAttribute('data-highcharts-chart'),points:[...el.querySelectorAll('.highcharts-point')].map(p=>{const r=p.getBoundingClientRect();return {cls:p.parentElement?.getAttribute('class'),rect:r.toJSON(),hit:document.elementsFromPoint(r.x+r.width/2,r.y+r.height/2).slice(0,3).map(x=>x.getAttribute('class'))}})}))))
    if(process.env.BENTO_SCREENSHOTS) { await fs.mkdir(process.env.BENTO_SCREENSHOTS,{recursive:true}); await p.screenshot({path:path.join(process.env.BENTO_SCREENSHOTS,'tooltip-failure.png')}) }
    throw error
  }
  await p.keyboard.press('Escape')
  // Save and open the result offline; all Highcharts code lives in that file.
  const saved=path.join(temp,'saved.bento.html')
  await fs.writeFile(saved,await p.evaluate(()=>window.bento.serialize()))
  const reopened=await ctx.newPage()
  await reopened.goto(pathToFileURL(saved).href)
  await reopened.waitForFunction(()=>window.bento?.doc?.title==='Highcharts CSV demo')
  assert.equal(await reopened.locator('.ed-stage-scale svg.highcharts-root').count(),1)
  assert.equal(await reopened.evaluate(()=>window.bento.doc.slides[0].elements[0].option.title.text),'Native configuration')
  if(process.env.BENTO_SCREENSHOTS) {
    await fs.mkdir(process.env.BENTO_SCREENSHOTS,{recursive:true})
    await reopened.screenshot({path:path.join(process.env.BENTO_SCREENSHOTS,'highcharts-editor.png'),fullPage:true})
  }
  // Real OOXML caches through the converter and the actual offline shell.
  const importedPptx = await convertPptx(await chartFixture())
  const exportedPptx = await exportPptx(importedPptx.doc)
  assert.ok(exportedPptx.report.entries.some(e=>e.code==='highcharts-native-chart'))
  const pptx = await convertPptx(exportedPptx.bytes)
  await p.evaluate(json=>window.bento.loadDoc(json), JSON.stringify(pptx.doc))
  const pptxChart = p.locator('.ed-stage-scale [data-el-id]').filter({has:p.locator('svg.highcharts-root')})
  await pptxChart.locator('svg.highcharts-root').waitFor()
  assert.equal(await pptxChart.locator('.highcharts-series-group .highcharts-point').count(), 2)
  assert.match(await pptxChart.textContent(), /变化趋势/)
  const convertedFile = path.join(temp,'converted.bento.html')
  await fs.writeFile(convertedFile,await p.evaluate(()=>window.bento.serialize()))
  const convertedPage = await ctx.newPage()
  await convertedPage.goto(pathToFileURL(convertedFile).href)
  await convertedPage.locator('.ed-stage-scale svg.highcharts-root').waitFor()
  assert.deepEqual(await convertedPage.evaluate(()=>window.bento.doc.slides[0].elements[0].option.series[0].data),[12,null,-4.25])
  if(process.env.BENTO_SCREENSHOTS) await convertedPage.screenshot({path:path.join(process.env.BENTO_SCREENSHOTS,'pptx-imported-chart.png'),fullPage:true})
  // Measure actual rendered column heights over time; a target option alone
  // would also pass if the data merely jumped to its final value.
  await p.bringToFront()
  const morph = doc({chart:{type:'column'},xAxis:{categories:['A','B','C']},yAxis:{min:0,max:25},
    legend:{enabled:false},series:[{name:'Value',data:[2,4,3]}]})
  morph.present={morphSeconds:2}
  morph.slides[0].elements[0].morphId='shared-chart'
  const next=structuredClone(morph.slides[0]);next.id='next';next.transition='morph'
  next.elements[0].id='next-chart';next.elements[0].option.series[0].data=[12,15,20]
  morph.slides.push(next)
  await p.evaluate(json=>window.bento.loadDoc(json),JSON.stringify(morph))
  await p.locator('.ed-pill-caret').click()
  await p.getByRole('button',{name:'Present in this tab',exact:true}).click()
  await p.locator('.bento-present-overlay section.present [data-highcharts-chart]').waitFor()
  await p.keyboard.press('ArrowRight')
  await p.locator('.bento-present-overlay section.present [data-el-id="next-chart"][data-highcharts-chart]').waitFor()
  const heights = await p.evaluate(async()=>{
    const values=[],start=performance.now()
    while(performance.now()-start<2300) {
      await new Promise(requestAnimationFrame)
      const point=document.querySelector('.bento-present-overlay section.present [data-el-id="next-chart"] .highcharts-series-group .highcharts-point')
      if(point)values.push(point.getBoundingClientRect().height)
    }
    return values
  })
  assert.ok(heights.length>10)
  assert.ok(heights.at(-1)>heights[0]+40,`column animates rather than jumps: ${heights[0]} → ${heights.at(-1)}`)
  assert.ok(new Set(heights.map(h=>Math.round(h))).size>5,'multiple intermediate rendered heights')
  await p.keyboard.press('Escape')
  // Reduced-motion viewers see the final values immediately.
  await p.emulateMedia({reducedMotion:'reduce'})
  await p.evaluate(json=>window.bento.loadDoc(json),JSON.stringify(morph))
  await p.locator('.ed-pill-caret').click()
  await p.getByRole('button',{name:'Present in this tab',exact:true}).click()
  await p.locator('.bento-present-overlay section.present [data-highcharts-chart]').waitFor()
  await p.keyboard.press('ArrowRight')
  await p.locator('.bento-present-overlay section.present [data-el-id="next-chart"][data-highcharts-chart]').waitFor()
  const reduced=p.locator('.bento-present-overlay section.present [data-el-id="next-chart"] .highcharts-series-group .highcharts-point').first()
  await reduced.waitFor()
  const reducedHeight=(await reduced.boundingBox()).height
  // Independent chart layouts can differ a few pixels in plot padding. The
  // reduced-motion chart must start near the final size AND stay stationary.
  assert.ok(Math.abs(reducedHeight-heights.at(-1))/heights.at(-1)<0.05,`reduced motion starts at the final geometry: ${reducedHeight} vs ${heights.at(-1)}`)
  const stationary = await reduced.evaluate(async point=>{
    const start=point.getBoundingClientRect().height
    await new Promise(resolve=>setTimeout(resolve,300))
    return Math.abs(point.getBoundingClientRect().height-start)
  })
  assert.ok(stationary<1,`reduced-motion column remains stationary (${stationary}px)`)

  await p.keyboard.press('Escape')
  await p.emulateMedia({reducedMotion:'no-preference'})
  assert.deepEqual(errors,[])
  assert.deepEqual(external,[],'no external request while loading, importing CSV, presenting or saving')
  console.log('Highcharts browser acceptance passed: presets, UTF-8 CSV file, pasted XY, headers, native JSON, tooltip and offline save/open.')
}finally{await browser.close();await fs.rm(temp,{recursive:true,force:true})}
