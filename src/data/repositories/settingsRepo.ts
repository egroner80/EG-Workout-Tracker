import { DEFAULT_SETTINGS, type AppSettings } from '../../domain/types'
import { db, type AppMeta } from '../db'

const EMPTY_META: AppMeta = { seeded: false, demoSeeded: false }

export async function getSettings(): Promise<AppSettings> {
  const record = await db.kv.get('settings')
  return record?.key === 'settings' ? { ...DEFAULT_SETTINGS, ...record.value } : { ...DEFAULT_SETTINGS }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.kv.put({ key: 'settings', value: settings })
}

export async function getMeta(): Promise<AppMeta> {
  const record = await db.kv.get('meta')
  return record?.key === 'meta' ? { ...EMPTY_META, ...record.value } : { ...EMPTY_META }
}

export async function updateMeta(patch: Partial<AppMeta>): Promise<AppMeta> {
  return db.transaction('rw', db.kv, async () => {
    const current = await getMeta()
    const next = { ...current, ...patch }
    await db.kv.put({ key: 'meta', value: next })
    return next
  })
}
