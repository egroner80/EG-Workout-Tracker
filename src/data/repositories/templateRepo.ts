import { syncSharedSteps } from '../../domain/sharedWarmup'
import type { TemplateId, WorkoutTemplate } from '../../domain/types'
import { otherTemplate } from '../../domain/workouts'
import { createTemplate } from '../seed/defaultTemplate'
import { db, templateKey } from '../db'

export async function getTemplate(id: TemplateId): Promise<WorkoutTemplate> {
  const record = await db.kv.get(templateKey(id))
  return record?.key === templateKey(id) ? (record.value as WorkoutTemplate) : createTemplate(id)
}

export async function getTemplates(): Promise<Record<TemplateId, WorkoutTemplate>> {
  const [upper, lower] = await Promise.all([getTemplate('upper'), getTemplate('lower')])
  return { upper, lower }
}

export async function saveTemplate(template: WorkoutTemplate): Promise<void> {
  await db.kv.put({ key: templateKey(template.id), value: template })
}

/**
 * Brings the warm-up steps the other workout shares with `source` in line
 * with it. Every template write outside a fresh seed goes through here.
 */
export async function syncOtherTemplate(source: WorkoutTemplate, now: number): Promise<void> {
  const other = await getTemplate(otherTemplate(source.id))
  const synced = syncSharedSteps(source, other)
  if (synced !== other) await saveTemplate({ ...synced, updatedAt: now })
}

/**
 * Read-modify-write in one transaction. Edits queue behind each other, so a
 * press-and-hold stepper never overwrites its own earlier steps. Shared
 * warm-up steps change in the other workout too.
 */
export async function modifyTemplate(
  id: TemplateId,
  recipe: (template: WorkoutTemplate) => WorkoutTemplate,
  now: number,
): Promise<WorkoutTemplate> {
  return db.transaction('rw', db.kv, async () => {
    const next: WorkoutTemplate = { ...recipe(await getTemplate(id)), id, updatedAt: now }
    await saveTemplate(next)
    await syncOtherTemplate(next, now)
    return next
  })
}
