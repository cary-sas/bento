// SPDX-License-Identifier: MIT
// Cross-platform runner for the converter/model loadability test. Keep the
// temporary bundle outside the tracked CI-rig namespace and remove it after use.
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const require = createRequire(import.meta.url)
const { buildSync } = require('../slides/node_modules/esbuild')
const dir = mkdtempSync(join(tmpdir(), 'bento-chart-import-'))
try {
  const out = join(dir, 'test.mjs')
  buildSync({ entryPoints: [fileURLToPath(new URL('./test-convert/chart-import.ts', import.meta.url))],
    bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' })
  await import(pathToFileURL(out).href)
} finally { rmSync(dir, { recursive: true, force: true }) }
