// SPDX-License-Identifier: MIT
import { PRESET_DATA } from './preset-data.ts'
import { NS, parseXml, kid, kids, attr, type XElem } from './xml.ts'

const templates = new Map<string, XElem>()
/** Resolve a preset with per-instance adjustments; never mutate shared defaults. */
export function presetDefinition(geom: XElem): XElem | undefined {
  const name = attr(geom, 'prst') ?? ''
  if (!Object.hasOwn(PRESET_DATA, name)) return undefined
  let template = templates.get(name)
  if (!template) {
    template = parseXml(`<a:custGeom xmlns:a="${NS.a}">${PRESET_DATA[name]}</a:custGeom>`)
    templates.set(name, template)
  }
  const defaults = kid(template, NS.a, 'avLst')
  const authored = kid(geom, NS.a, 'avLst')
  if (!defaults || !authored) return template
  const overrides = new Map(kids(authored, NS.a, 'gd').map(g => [attr(g, 'name'), g]))
  const av = { ...defaults, children: kids(defaults).map(g => overrides.get(attr(g, 'name')) ?? g) }
  return { ...template, children: template.children.map(c => c === defaults ? av : c) }
}
