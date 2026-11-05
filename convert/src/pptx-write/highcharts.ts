// SPDX-License-Identifier: MIT
// Map the explicitly supported Highcharts data subset into the DrawingML
// writer's input shape. This is data translation, never a legacy renderer.
type Dict = Record<string, any>
const obj = (v: unknown): Dict => v && typeof v === 'object' && !Array.isArray(v) ? v as Dict : {}
const axis = (v: unknown): Dict => obj(Array.isArray(v) ? v[0] : v)
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function nativeChartOptions(input: Record<string, unknown>): Dict | undefined {
  const o = input as Dict, chart = obj(o.chart)
  if (chart.options3d?.enabled || chart.polar || chart.inverted || o.responsive || o.drilldown) return undefined
  const raw = Array.isArray(o.series) ? o.series : []
  if (!raw.length || raw.length > 50) return undefined
  const types = raw.map(s => obj(s).type ?? chart.type ?? 'line')
  if (types.some(t => !['column','bar','line','spline','area','pie','scatter'].includes(t))) return undefined
  if (types.includes('bar') && types.some(t=>t!=='bar')) return undefined
  if (types.includes('scatter') && types.some(t=>t!=='scatter')) return undefined
  if (types.includes('pie') && raw.length !== 1) return undefined
  const xAxis = axis(o.xAxis)
  const ys = (Array.isArray(o.yAxis) ? o.yAxis : [o.yAxis ?? {}]).map(obj)
  if (ys.length > 2 || [...ys,xAxis].some(a=>a.type === 'logarithmic' || a.type === 'datetime' || a.reversed)) return undefined
  if (xAxis.categories !== undefined && !Array.isArray(xAxis.categories)) return undefined
  const categories = Array.isArray(xAxis.categories) ? xAxis.categories.map(String) : undefined
  const allData = raw.map(s=>obj(s).data)
  if (allData.some(d=>!Array.isArray(d) || !d.length || d.length > 2000)) return undefined
  const count = Math.max(...allData.map(d=>d.length))
  if (allData.reduce((n,d)=>n+d.length,0) > 12000) return undefined
  const labels = Array.from({length:Math.max(count,categories?.length ?? 0)},(_,i)=>categories?.[i] ?? String(i))
  const xy = types.every(t=>t==='scatter') || !categories && types.every(t=>t==='line'||t==='spline') &&
    raw.some(s=>s.pointStart!==undefined || s.pointInterval!==undefined || s.data.some((p: any)=>Array.isArray(p)&&typeof p[0]==='number'||p&&typeof p==='object'&&!Array.isArray(p)&&p.x!==undefined))
  const names = new Map<number,string>()
  const series: Dict[] = []
  for (const [si, value] of raw.entries()) {
    const s = obj(value), type = types[si], defaults = {...obj(obj(o.plotOptions).series),...obj(obj(o.plotOptions)[type])}
    if (s.visible === false || s.keys || s.dataSorting?.enabled || s.stacking || defaults.stacking || s.stack !== undefined) return undefined
    if (s.yAxis !== undefined && s.yAxis !== 0 && s.yAxis !== 1) return undefined
    if (s.xAxis !== undefined && s.xAxis !== 0) return undefined
    if (s.pointIntervalUnit) return undefined
    const start=s.pointStart ?? 0, step=s.pointInterval ?? 1
    if (!number(start)||!number(step)||step<=0 || !xy && (start!==0||step!==1)) return undefined
    const data: unknown[] = []
    for (const [i, point] of s.data.entries()) {
      let y: unknown = point, name: unknown, color: unknown, x: unknown = start+i*step
      if (Array.isArray(point)) {
        if (point.length !== 2) return undefined
        if (xy && typeof point[0]==='number') [x,y] = point
        else if (typeof point[0] === 'string') [name,y] = point
        else return undefined // Numeric X must not become a category index.
      } else if (point && typeof point === 'object') {
        if (Object.keys(point).some(k=>!['x','y','name','color'].includes(k))) return undefined
        y = point.y; name = point.name; color = point.color
        if (point.x !== undefined) {
          if (xy) x = point.x
          else if (point.x !== i) return undefined
        }
      }
      if (y !== null && !number(y)) return undefined
      if (type === 'pie' && typeof y === 'number' && y < 0) return undefined
      if (xy) {
        if (!number(x)) return undefined
        data.push([x,y])
      } else if (type === 'pie') {
        data.push({name:String(name ?? categories?.[i] ?? i),value:y,...(typeof color === 'string'?{itemStyle:{color}}:{})})
      } else {
        if (color !== undefined) return undefined // Per-point fills need a dPt mapper.
        if (name !== undefined && !categories) {
          if (names.has(i) && names.get(i)!==String(name)) return undefined
          names.set(i,String(name));labels[i]=String(name)
        }
        data.push(y)
      }
    }
    if (!xy && type!=='pie') while(data.length<labels.length)data.push(null)
    const inner = s.innerSize ?? defaults.innerSize ?? 0
    if (type === 'pie' && (typeof inner === 'string' && !/^\d+(?:\.\d+)?%$/.test(inner) || typeof inner === 'number' && inner !== 0)) return undefined
    series.push({type:xy?'scatter':type==='column'||type==='bar'?'bar':type==='spline'?'line':type,
      name:s.name, data, yAxisIndex:s.yAxis ?? 0, smooth:type==='spline',
      itemStyle:{color:s.color ?? defaults.color}, radius:type==='pie'?[inner,'100%']:undefined,
      markerEnabled:s.marker?.enabled ?? defaults.marker?.enabled,
      scatterLine:xy && (type!=='scatter'||(s.lineWidth ?? defaults.lineWidth ?? 0)>0)})
  }
  const legend=obj(o.legend)
  const yAxis = ys.map(y=>({min:y.min,max:y.max,axisLabel:{formatter:obj(y.labels).format},opposite:y.opposite}))
  return {series,xAxis:{data:labels,min:xAxis.min,max:xAxis.max},yAxis,color:o.colors,title:o.title,
    horizontal:types[0]==='bar',
    legend:legend.enabled===false?false:{...(legend.verticalAlign==='top'?{top:0}:legend.align==='right'?{right:0}:legend.align==='left'?{left:0}:{bottom:0})}}
}
