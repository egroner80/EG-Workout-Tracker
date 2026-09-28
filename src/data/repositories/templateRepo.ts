import { isValidTemplate } from '../../domain/migrate'
import { syncSharedSteps } from '../../domain/sharedWarmup'
import type { TemplateId, WorkoutTemplate } from '../../domain/types'
import { otherTemplate } from '../../domain/workouts'
import { createTemplate } from '../seed/defaultTemplate'
import { db, templateKey } from '../db'

/**
 * The stored template for a workout, or undefined when there is none or it
 * cannot be read. Chained on Dexie's promise rather than awaited in another
 * async layer, so callers inside a transaction keep it open.
 */
export function readStoredTemplate(id: TemplateId): Promise<WorkoutTemplate | undefined> {
  return db.kv.get(templateKey(id)).then((record) => {
    const value: unknown = record?.key === templateKey(id) ? record.value : undefined
    return isValidTemplate(value) && value.id === id ? value : undefined
  })
}

/** A workout's template; the seed stands in for one that is missing or unreadable (startup rewrites it). */
export function getTemplate(id: TemplateId): Promise<WorkoutTemplate> {
  return readStoredTemplate(id).then((template) => template ?? createTemplate(id))
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
 * warm-up steps change in the other workout too. A recipe that changes
 * nothing returns the template it was given: nothing is written.
 */
export async function modifyTemplate(
  id: TemplateId,
  recipe: (template: WorkoutTemplate) => WorkoutTemplate,
  now: number,
): Promise<WorkoutTemplate> {
  return db.transaction('rw', db.kv, async () => {
    const current = await getTemplate(id)
    const edited = recipe(current)
    if (edited === current) return current
    const next: WorkoutTemplate = { ...edited, id, updatedAt: now }
    await saveTemplate(next)
    await syncOtherTemplate(next, now)
    return next
  })
}
