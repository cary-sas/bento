// SPDX-License-Identifier: MIT
import { buildPptx, slide } from './_fixtures.ts'
export const customShapeXml = (paths: string) => '<p:sp><p:nvSpPr><p:cNvPr id="20" name="Complex object"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>' +
  '<p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="3810000" cy="1905000"/></a:xfrm>' +
  '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst>'+paths+'</a:pathLst></a:custGeom>' +
  '<a:solidFill><a:srgbClr val="336699"/></a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="FF3300"/></a:solidFill></a:ln></p:spPr>' +
  '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="1800"/><a:t>可编辑文字</a:t></a:r></a:p></p:txBody></p:sp>'
export const complexPaths = '<a:path w="400" h="200" stroke="false"><a:moveTo><a:pt x="0" y="100"/></a:moveTo>' +
  '<a:cubicBezTo><a:pt x="100" y="0"/><a:pt x="300" y="0"/><a:pt x="400" y="100"/></a:cubicBezTo>' +
  '<a:quadBezTo><a:pt x="200" y="300"/><a:pt x="0" y="100"/></a:quadBezTo><a:close/></a:path>' +
  '<a:path w="400" h="200" fill="none"><a:moveTo><a:pt x="250" y="100"/></a:moveTo>' +
  '<a:arcTo wR="50" hR="25" stAng="0" swAng="21600000"/><a:close/></a:path>'
export const geometryFixture = () => buildPptx({slides:[{xml:slide(customShapeXml(complexPaths))}]})
