// SPDX-License-Identifier: MIT
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { pathToFileURL, fileURLToPath } from 'node:url'
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
  await live.locator('.highcharts-series-group .highcharts-point').first().hover()
  try {
    await p.waitForFunction(()=>[...document.querySelectorAll('.highcharts-tooltip')].some(e=>e.getAttribute('visibility')!=='hidden'),null,{timeout:10000})
  } catch(error) {
    console.log('Tooltip diagnostic',JSON.stringify(await live.evaluate(el=>({html:el.innerHTML.slice(-3000),rect:el.getBoundingClientRect().toJSON(),attr:el.getAttribute('data-highcharts-chart'),points:[...el.querySelectorAll('.highcharts-point')].map(p=>{const r=p.getBoundingClientRect();return {cls:p.parentElement?.getAttribute('class'),rect:r.toJSON(),hit:document.elementsFromPoint(r.x+r.width/2,r.y+r.height/2).slice(0,3).map(x=>x.getAttribute('class'))}})}))))
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
  assert.deepEqual(errors,[])
  assert.deepEqual(external,[],'no external request while loading, importing CSV, presenting or saving')
  console.log('Highcharts browser acceptance passed: presets, UTF-8 CSV file, pasted XY, headers, native JSON, tooltip and offline save/open.')
}finally{await browser.close();await fs.rm(temp,{recursive:true,force:true})}
