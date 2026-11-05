// SPDX-License-Identifier: MIT
// Only interpolate Y values when chart topology and point identities match.
// Reordered categories or changed chart types must display the new chart.
type Options = Record<string, any>
const object = (v: unknown): Options => v && typeof v === 'object' && !Array.isArray(v) ? v : {}
const numeric = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v)
const supported = new Set(['column','bar','line','spline','area','areaspline','scatter','pie'])
function identity(p: any): string | undefined {
  if (p === null) return 'null'
  if (numeric(p)) return 'scalar'
  if (Array.isArray(p)) return p.length === 2 && (numeric(p[0]) || typeof p[0] === 'string') && numeric(p[1])
    ? JSON.stringify(['pair',p[0]]) : undefined
  if (p && typeof p === 'object' && numeric(p.y)) {
    const {y: _y,...rest} = p
    return JSON.stringify(['point',rest])
  }
  return undefined
}
export function chartTransitionData(from: Options, to: Options): unknown[][] | undefined {
  const a = object(from.chart), b = object(to.chart)
  if (a.inverted !== b.inverted || a.polar || b.polar) return undefined
  for (const axis of ['xAxis','yAxis']) if (JSON.stringify(from[axis]) !== JSON.stringify(to[axis])) return undefined
  const before = from.series, after = to.series
  if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length || !before.length) return undefined
  const data: unknown[][] = []
  for (let i=0;i<before.length;i++) {
    const old = object(before[i]), next = object(after[i])
    const oldType=old.type??a.type??'line', nextType=next.type??b.type??'line'
    if (oldType!==nextType || !supported.has(nextType)) return undefined
    const {data:oldData,...oldStyle}=old, {data:nextData,...nextStyle}=next
    if (JSON.stringify(oldStyle)!==JSON.stringify(nextStyle) || !Array.isArray(oldData) || !Array.isArray(nextData) || oldData.length!==nextData.length) return undefined
    for (let j=0;j<oldData.length;j++) {
      const key=identity(oldData[j])
      if (key===undefined || key!==identity(nextData[j])) return undefined
    }
    data.push(oldData)
  }
  return data
}
