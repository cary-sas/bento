// SPDX-License-Identifier: MIT
// Keep encryption/save helpers, but this licensed fork has no signed release
// channel. Never replace it with an ordinary upstream shell or contact that
// channel automatically. Administrators update it from the internal server.
import { t } from './i18n'
import type { UpdateCheck } from '../../kernel/src/update.ts'
export * from '../../kernel/src/update.ts'
export function autoCheckEnabled(): boolean { return false }
export async function checkForUpdates(_manifestUrl?: string): Promise<UpdateCheck> {
  return { status: 'error', message: t('This Highcharts edition is updated from your internal server.') }
}
