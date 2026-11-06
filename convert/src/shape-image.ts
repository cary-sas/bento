// SPDX-License-Identifier: MIT
import type { OutShape, OutImage } from './types.ts'
import type { AssetStore } from './media.ts'
const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
/** Paint geometry only. Text never enters this SVG, so the editable overlay
 * cannot duplicate baked-in labels. Identical SVG bytes reuse one asset. */
export function shapeImage(layers: OutShape[], assets: AssetStore): OutImage {
  const first = layers[0]
  const defs: string[] = []
  const paths = layers.map((shape, i) => {
    let fill = esc(shape.fill)
    if (shape.fillGradient) {
      const g = shape.fillGradient, angle = g.angle * Math.PI / 180
      const dx = Math.sin(angle) / 2, dy = -Math.cos(angle) / 2
      defs.push(`<linearGradient id="g${i}" x1="${0.5-dx}" y1="${0.5-dy}" x2="${0.5+dx}" y2="${0.5+dy}">${g.stops.map(s=>`<stop offset="${s.at}" stop-color="${esc(s.color)}"/>`).join('')}</linearGradient>`)
      fill = `url(#g${i})`
    }
    const dash = shape.strokeStyle === 'dashed' ? '6 4' : shape.strokeStyle === 'dotted' ? '1 3' : undefined
    return `<path d="${esc(shape.d ?? '')}" fill="${fill}" stroke="${esc(shape.stroke)}" stroke-width="${shape.strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
  }).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${first.w} ${first.h}"><defs>${defs.join('')}</defs>${paths}</svg>`
  const key = assets.registerBytes(new TextEncoder().encode(svg), 'image/svg+xml')
  return { id: first.id, type: 'image', x: first.x, y: first.y, w: first.w, h: first.h,
    rotation: first.rotation, opacity: first.opacity, src: `asset:${key}`, fit: 'fill',
    ...(first.groupId ? {groupId:first.groupId} : {}), ...(first.shadow ? {shadow:first.shadow} : {}) }
}
