import { migrateTemplate } from '../../domain/migrate'
import { syncSharedSteps } from '../../domain/sharedWarmup'
import { DEFAULT_SETTINGS, type TemplateId, type WorkoutTemplate } from '../../domain/types'
import { TEMPLATE_IDS, otherTemplate } from '../../domain/workouts'
import { db, templateKey, type AppMeta } from '../db'
import { createTemplate } from './defaultTemplate'
import { generateDemoHistory } from './demoHistory'

/**
 * Runs on every start, in one transaction with the flags that guard it:
 * moves the single template of earlier versions to the upper-body workout,
 * seeds any missing workout and the settings, and seeds demo history once.
 * It only inserts and moves: it never overwrites a template or settings the
 * user already has.
 */
export async function bootstrap(now: number, { demo = true }: { demo?: boolean } = {}): Promise<void> {
  await db.transaction('rw', db.kv, db.sessions, async () => {
    const metaRecord = await db.kv.get('meta')
    const meta: AppMeta = metaRecord?.key === 'meta' ? { ...metaRecord.value } : { seeded: false, demoSeeded: false }

    await moveLegacyTemplate()
    const templates = await seedMissingTemplates()

    if (!meta.seeded) {
      if (!(await db.kv.get('settings'))) await db.kv.add({ key: 'settings', value: { ...DEFAULT_SETTINGS } })
      meta.seeded = true
    }

    if (!meta.demoSeeded && demo) await db.sessions.bulkAdd(generateDemoHistory({ now, templates }))
    meta.demoSeeded = true

    await db.kv.put({ key: 'meta', value: meta })
  })
}

async function storedTemplate(id: TemplateId): Promise<WorkoutTemplate | undefined> {
  const record = await db.kv.get(templateKey(id))
  return record?.key === templateKey(id) ? (record.value as WorkoutTemplate) : undefined
}

/**
 * Schema 1 kept one template under `template`. It becomes the upper-body
 * workout (with the squat routine) unless a newer upper template exists, for
 * example one saved while an old tab still wrote the legacy key. A record
 * that cannot be read stays where it is and upper falls back to the seed.
 */
async function moveLegacyTemplate(): Promise<void> {
  const legacy = await db.kv.get('template')
  if (legacy?.key !== 'template') return
  let migrated: WorkoutTemplate
  try {
    migrated = migrateTemplate(legacy.value, 1)
  } catch {
    return
  }
  const upper = await storedTemplate('upper')
  if (!upper || upper.updatedAt < migrated.updatedAt) await db.kv.put({ key: templateKey('upper'), value: migrated })
  await db.kv.delete('template')
}

/** A newly seeded workout takes its shared warm-up steps from the one the user already has. */
async function seedMissingTemplates(): Promise<Record<TemplateId, WorkoutTemplate>> {
  const stored: Partial<Record<TemplateId, WorkoutTemplate>> = {}
  for (const id of TEMPLATE_IDS) stored[id] = await storedTemplate(id)
  const templates = { ...stored }
  for (const id of TEMPLATE_IDS) {
    if (templates[id]) continue
    const existing = stored[otherTemplate(id)]
    const seeded = existing ? syncSharedSteps(existing, createTemplate(id)) : createTemplate(id)
    await db.kv.add({ key: templateKey(id), value: seeded })
    templates[id] = seeded
  }
  return templates as Record<TemplateId, WorkoutTemplate>
}
