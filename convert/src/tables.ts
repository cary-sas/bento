// SPDX-License-Identifier: MIT
// DrawingML table → editable bento table. The format has no cell spans or
// independent row heights, so retain the grid and report those differences.
import { NS, kid, kids, attr, intAttr, type XElem } from './xml.ts'
import { textFrom, type TextDeps } from './text.ts'
import { resolveColor } from './theme.ts'
import { EMU_PER_PX, type InheritCtx, type OutTable, type OutTableCell } from './types.ts'
import type { GroupFrame } from './shapes.ts'

const px = (v: number): number => Math.round(v / EMU_PER_PX * 100) / 100
const flag = (v: string | undefined): boolean => v === '1' || v === 'true'

export function tableFrom(
  tbl: XElem, frame: GroupFrame, id: string, ctx: InheritCtx, deps: TextDeps, where: string,
): OutTable | undefined {
  const grid = kid(tbl, NS.a, 'tblGrid')
  const columns = grid ? kids(grid, NS.a, 'gridCol') : []
  const rows = kids(tbl, NS.a, 'tr')
  if (!columns.length || !rows.length || columns.length > 200 || rows.length > 2000 ||
      rows.some(row => kids(row, NS.a, 'tc').length > columns.length)) {
    ctx.report.add('dropped', 'table-import-unsupported', where,
      'Table grid is missing, inconsistent or exceeds 200 columns / 2000 rows — a placeholder marks the table')
    return undefined
  }
  let merged = false, fontSize = 16, firstText = true
  const heights = new Set(rows.map(row => attr(row, 'h')))
  const resultRows = rows.map(row => {
    const cells = kids(row, NS.a, 'tc')
    return { cells: columns.map((_, i): OutTableCell => {
      const cell = cells[i]
      if (!cell) return { html: '' }
      if (flag(attr(cell, 'hMerge')) || flag(attr(cell, 'vMerge')) ||
          intAttr(cell, 'gridSpan', 1) > 1 || intAttr(cell, 'rowSpan', 1) > 1) merged = true
      const body = kid(cell, NS.a, 'txBody')
      // textFrom reads p:txBody; its a:p/a:r children have identical semantics.
      const shape: XElem = { name: 'p:sp', local: 'sp', ns: NS.p, attrs: new Map(),
        children: body ? [{ ...body, ns: NS.p, name: 'p:txBody' }] : [] }
      const text = textFrom(shape, ctx, { ...deps, effectivePhType: () => 'other', needsRefit: undefined,
        resolveFrame: () => ({ ...frame, from: 'own' }), labeledChain: () => [{ el: shape, from: 'own' }] })
      if (text && firstText) { fontSize = text.fontSize; firstText = false }
      const props = kid(cell, NS.a, 'tcPr')
      const fill = props && kid(props, NS.a, 'solidFill')
      const color = fill && resolveColor(fill, ctx.theme)
      return { html: text?.html ?? '', ...(text ? { align: text.align, color: text.color, bold: text.fontWeight >= 700 } : {}),
        ...(color ? { bg: color.css } : props && kid(props, NS.a, 'noFill') ? { bg: 'transparent' } : {}) }
    }) }
  })
  if (merged) ctx.report.add('approximated', 'table-merges-flattened', where,
    'Merged cells flattened into the editable grid; anchor text stays in its source cell')
  if (heights.size > 1) ctx.report.add('approximated', 'table-row-heights-equalized', where,
    'Individual PowerPoint row heights become equal-height bento rows')
  if (frame.flipH || frame.flipV) ctx.report.add('approximated', 'flip-dropped', where,
    'Table reflection has no bento table field')
  ctx.report.add('approximated', 'table-imported', where,
    'Table text, grid widths and explicit cell colors imported; Office table styles, borders, padding and per-cell font sizes may differ')
  const props = kid(tbl, NS.a, 'tblPr')
  return { id, type: 'table', x: px(frame.x), y: px(frame.y), w: px(frame.w), h: px(frame.h),
    rotation: frame.rotation, opacity: 1, columns: columns.map(col => ({ w: Math.max(1, px(intAttr(col, 'w', EMU_PER_PX))) })),
    rows: resultRows, header: !!props && flag(attr(props, 'firstRow')),
    style: { fontSize, color: '#1E2A3A', headerBg: '#EFF2F5', headerColor: '#1E2A3A',
      borderColor: '#C9CFD6', borderWidth: 1, cellPadX: 10, cellPadY: 6, radius: 0 } }
}
