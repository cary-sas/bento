// SPDX-License-Identifier: MIT
import path from 'node:path'
import { fileURLToPath } from 'node:url'
export const root = fileURLToPath(new URL('../../', import.meta.url))
export function configFromEnv(env = process.env) {
  const integer = (name, fallback, min, max) => {
    const value = Number(env[name] ?? fallback)
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error(`${name} must be an integer from ${min} to ${max}`)
    return value
  }
  const host = env.BENTO_HOST || '127.0.0.1'
  const token = env.BENTO_TOKEN || ''
  if (token && token.length < 16) throw new Error('BENTO_TOKEN must have at least 16 characters')
  if (!['127.0.0.1', '::1', 'localhost'].includes(host) && !token)
    throw new Error('Set BENTO_TOKEN (at least 16 characters) before listening on a LAN address')
  return {
    host, token,
    port: integer('BENTO_PORT', 3080, 0, 65535),
    maxInputMb: integer('BENTO_MAX_INPUT_MB', 500, 1, 4096),
    maxUnpackedMb: integer('BENTO_MAX_UNPACKED_MB', 1500, 1, 4096),
    maxJobs: integer('BENTO_MAX_JOBS', 4, 1, 100),
    timeoutMs: integer('BENTO_TIMEOUT_SECONDS', 900, 1, 86400) * 1000,
    ttlMs: integer('BENTO_RETENTION_MINUTES', 60, 1, 10080) * 60000,
    shell: path.resolve(env.BENTO_SHELL || path.join(root, 'slides/dist-single/Bento_Slides.bento.html')),
    dataDir: path.resolve(env.BENTO_DATA_DIR || path.join(root, 'server/import/data')),
    secureCookies: env.BENTO_SECURE_COOKIES === '1',
  }
}
