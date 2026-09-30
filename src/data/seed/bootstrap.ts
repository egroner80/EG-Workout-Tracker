import { migrateTemplate } from '../../domain/migrate'
import { replaceRetiredExercises } from '../../domain/retiredExercises'
import { syncSharedSteps } from '../../domain/sharedWarmup'
import { DEFAULT_SETTINGS, type TemplateId, type WorkoutTemplate } from '../../domain/types'
import { TEMPLATE_IDS, otherTemplate } from '../../domain/workouts'
import { db, templateKey, type AppMeta } from '../db'
import { readStoredTemplate } from '../repositories/templateRepo'
import { createTemplate } from './defaultTemplate'
import { generateDemoHistory } from './demoHistory'

/**
 * Runs on every start, in one transaction with the flags that guard it:
 * moves the single template of earlier versions to the upper-body workout,
 * swaps retired built-in exercises for their successors, seeds any missing
 * workout and the settings, and seeds demo history once. Beyond those swaps
 * it only inserts and moves: it never overwrites the user's edits to a
 * template or their settings.
 */
export async function bootstrap(now: number, { demo = true }: { demo?: boolean } = {}): Promise<void> {
  await db.transaction('rw', db.kv, db.sessions, async () => {
    const metaRecord = await db.kv.get('meta')
    const meta: AppMeta = metaRecord?.key === 'meta' ? { ...metaRecord.value } : { seeded: false, demoSeeded: false }

    await moveLegacyTemplate(now)
    await replaceRetiredStoredExercises()
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

/**
 * Schema 1 kept one template under `template`. It becomes the upper-body
 * workout (with the squat routine) whenever it is newer than the stored upper,
 * and lower takes its shared warm-up steps. The record itself stays: a build
 * from before the lower-body workout, still open in another tab, keeps editing
 * the user's real template instead of its seed, and those edits come through
 * here on the next start. A record that cannot be read is left alone.
 */
async function moveLegacyTemplate(now: number): Promise<void> {
  const legacy = await db.kv.get('template')
  if (legacy?.key !== 'template') return
  let migrated: WorkoutTemplate
  try {
    migrated = migrateTemplate(legacy.value, 1)
  } catch {
    return
  }
  const upper = await readStoredTemplate('upper')
  if (upper && upper.updatedAt >= migrated.updatedAt) return
  await db.kv.put({ key: templateKey('upper'), value: migrated })
  const lower = await readStoredTemplate('lower')
  const synced = lower && syncSharedSteps(migrated, lower)
  if (synced && synced !== lower) await db.kv.put({ key: templateKey('lower'), value: { ...synced, updatedAt: now } })
}

/**
 * A stored workout that still lists a retired exercise gets its successor in
 * the same slot. `updatedAt` stays: the app changed its exercise list, the user
 * edited nothing. The workouts' past sessions keep what was done.
 */
async function replaceRetiredStoredExercises(): Promise<void> {
  for (const id of TEMPLATE_IDS) {
    const stored = await readStoredTemplate(id)
    const current = stored && replaceRetiredExercises(stored)
    if (current && current !== stored) await db.kv.put({ key: templateKey(id), value: current })
  }
}

/**
 * Seeds each workout that is missing or unreadable. A newly seeded workout
 * takes its shared warm-up steps from the one the user already has.
 */
async function seedMissingTemplates(): Promise<Record<TemplateId, WorkoutTemplate>> {
  const [upper, lower] = await Promise.all([readStoredTemplate('upper'), readStoredTemplate('lower')])
  const stored: Partial<Record<TemplateId, WorkoutTemplate>> = { upper, lower }
  const templates = { ...stored }
  for (const id of TEMPLATE_IDS) {
    if (templates[id]) continue
    const existing = stored[otherTemplate(id)]
    const seeded = existing ? syncSharedSteps(existing, createTemplate(id)) : createTemplate(id)
    // put, not add: this also replaces a stored template that could not be read.
    await db.kv.put({ key: templateKey(id), value: seeded })
    templates[id] = seeded
  }
  return templates as Record<TemplateId, WorkoutTemplate>
}
