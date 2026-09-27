import type { WorkoutTemplate } from '../../domain/types'
import { createDefaultTemplate } from '../seed/defaultTemplate'
import { db } from '../db'

export async function getTemplate(): Promise<WorkoutTemplate> {
  const record = await db.kv.get('template')
  return record?.key === 'template' ? record.value : createDefaultTemplate()
}

export async function saveTemplate(template: WorkoutTemplate): Promise<void> {
  await db.kv.put({ key: 'template', value: template })
}

/**
 * Read-modify-write in one transaction. Edits queue behind each other, so a
 * press-and-hold stepper never overwrites its own earlier steps.
 */
export async function modifyTemplate(
  recipe: (template: WorkoutTemplate) => WorkoutTemplate,
  now: number,
): Promise<WorkoutTemplate> {
  return db.transaction('rw', db.kv, async () => {
    const next = { ...recipe(await getTemplate()), updatedAt: now }
    await saveTemplate(next)
    return next
  })
}
