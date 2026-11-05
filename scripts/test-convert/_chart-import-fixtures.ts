// SPDX-License-Identifier: MIT
import { buildPptx, slide, XMLNS } from './_fixtures.ts'
export const C = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
export const cacheXml = (kind: 'str' | 'num', values: Array<string | number | null>): string =>
  `<c:${kind}Ref><c:f>Sheet1!A1:A3</c:f><c:${kind}Cache><c:ptCount val="${values.length}"/>` +
  values.map((v, i) => v === null ? '' : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('') +
  `</c:${kind}Cache></c:${kind}Ref>`
export const seriesXml = (xy = false): string => '<c:ser><c:idx val="0"/><c:order val="0"/>' +
  '<c:tx><c:v>治疗组 A</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="123456"/></a:solidFill></c:spPr>' +
  (xy ? `<c:xVal>${cacheXml('num', [0, 5, 20])}</c:xVal><c:yVal>${cacheXml('num', [12, null, -4.25])}</c:yVal>` :
    `<c:cat>${cacheXml('str', ['基线', '第2周', '第4周'])}</c:cat><c:val>${cacheXml('num', [12, null, -4.25])}</c:val>`) + '</c:ser>'
export const chartXml = (kind = 'barChart', body = seriesXml()): string =>
  `<c:chartSpace xmlns:c="${C}" ${XMLNS}><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>变化趋势</a:t></a:r></a:p></c:rich></c:tx></c:title>` +
  `<c:plotArea><c:${kind}><c:barDir val="col"/><c:grouping val="clustered"/>${body}<c:axId val="42"/><c:axId val="77"/></c:${kind}>` +
  '<c:catAx><c:axId val="42"/><c:axPos val="b"/></c:catAx>' +
  '<c:valAx><c:axId val="77"/><c:scaling><c:min val="-10"/><c:max val="20"/></c:scaling><c:axPos val="l"/></c:valAx>' +
  '</c:plotArea><c:legend/></c:chart></c:chartSpace>'
export const graphicFrame = (body: string): string =>
  '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="9" name="Imported data"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>' +
  '<p:xfrm><a:off x="914400" y="457200"/><a:ext cx="9144000" cy="4572000"/></p:xfrm>' +
  `<a:graphic><a:graphicData>${body}</a:graphicData></a:graphic></p:graphicFrame>`
export function chartFixture(xml = chartXml(), mode = ''): Promise<Uint8Array> {
  return buildPptx({ slides: [{ xml: slide(graphicFrame(`<c:chart xmlns:c="${C}" r:id="rIdDifferentName"/>`)),
    rels: `<Relationship Id="rIdDifferentName" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/custom-name.xml" ${mode}/>` }],
    media: { 'ppt/charts/custom-name.xml': xml } })
}
