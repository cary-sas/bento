// SPDX-License-Identifier: MIT
// Cross-platform single-file build: no shell env assignments, mv, rm or touch.
import { spawnSync } from 'node:child_process'
import { renameSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = fileURLToPath(new URL('../', import.meta.url))
const app = path.join(root, 'slides')
const sealed = process.argv.includes('--sealtest')
const outDir = sealed ? 'dist-sealtest' : 'dist-single'
function run(script, args = [], env = process.env) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: app, env, stdio: 'inherit' })
  if (r.error) throw r.error
  if (r.status !== 0) process.exit(r.status ?? 1)
}
if (sealed) rmSync(path.join(app, outDir), { recursive: true, force: true })
run(path.join(app, 'node_modules/typescript/bin/tsc'), ['-b'])
run(path.join(app, 'node_modules/vite/bin/vite.js'), ['build', '--outDir', outDir], {
  ...process.env, SINGLEFILE: '1', BENTO_TEST_SEAL: sealed ? '1' : '0',
})
const output = path.join(app, outDir, 'Bento_Slides.bento.html')
rmSync(output, { force: true })
renameSync(path.join(app, outDir, 'index.html'), output)
run(path.join(root, 'scripts/postbuild-compress.mjs'), [output])
if (sealed) writeFileSync(path.join(app, outDir, '.complete'), '')
