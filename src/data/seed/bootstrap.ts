import { DEFAULT_SETTINGS } from '../../domain/types'
import { db, type AppMeta } from '../db'
import { createDefaultTemplate } from './defaultTemplate'
import { generateDemoHistory } from './demoHistory'

/**
 * Seeds the template, settings, and demo history exactly once, in a single
 * transaction with the flags that guard them. Seeding only inserts: it never
 * overwrites a template or settings that already exist.
 */
export async function bootstrap(now: number, { demo = true }: { demo?: boolean } = {}): Promise<void> {
  await db.transaction('rw', db.kv, db.sessions, async () => {
    const metaRecord = await db.kv.get('meta')
    const meta: AppMeta = metaRecord?.key === 'meta' ? { ...metaRecord.value } : { seeded: false, demoSeeded: false }

    if (!meta.seeded) {
      if (!(await db.kv.get('template'))) await db.kv.add({ key: 'template', value: createDefaultTemplate() })
      if (!(await db.kv.get('settings'))) await db.kv.add({ key: 'settings', value: { ...DEFAULT_SETTINGS } })
      meta.seeded = true
    }

    if (!meta.demoSeeded && demo) {
      const templateRecord = await db.kv.get('template')
      const template = templateRecord?.key === 'template' ? templateRecord.value : createDefaultTemplate()
      await db.sessions.bulkAdd(generateDemoHistory({ now, template }))
    }
    meta.demoSeeded = true

    await db.kv.put({ key: 'meta', value: meta })
  })
}
