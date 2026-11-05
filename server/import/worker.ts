// SPDX-License-Identifier: MIT
// One disposable process per conversion. No release lookup or outbound fetch.
import fs from 'node:fs/promises'
import { preflight } from '../../convert/src/limits.ts'
import { convertPptx } from '../../convert/src/pptx.ts'
import { gateDoc, spliceIntoShell } from '../../convert/src/deliver.ts'
import { LIMITS as documentLimits } from '../../slides/src/untrusted.ts'
const [input, shell, output, report, inputMb, unpackedMb] = process.argv.slice(2)
try {
  const bytes = new Uint8Array(await fs.readFile(input))
  preflight(bytes, {
    inputBytes: Number(inputMb) * 1024 * 1024,
    totalUncompressed: Number(unpackedMb) * 1024 * 1024,
  })
  const { doc, report: fidelity } = await convertPptx(bytes)
  if (doc.slides.length > documentLimits.slides)
    throw new Error(`More than ${documentLimits.slides} slides: split the presentation first.`)
  const assets = Object.values(doc.assets ?? {})
  if (assets.length > documentLimits.assets || assets.some((v) => v.length > documentLimits.asset))
    throw new Error('An image exceeds the document asset limit (32 MiB encoded), or there are more than 2000 assets. Compress images or split the presentation.')
  const safe = gateDoc(doc)
  const result = { html: spliceIntoShell(await fs.readFile(shell, 'utf8'), safe.doc),
    report: fidelity, gated: safe.dropped }
  await fs.writeFile(output, result.html)
  await fs.writeFile(report, JSON.stringify({ ...result.report, gated: result.gated,
    documentLimits: { slides: documentLimits.slides, assetCharacters: documentLimits.asset, assets: documentLimits.assets },
  }, null, 2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
