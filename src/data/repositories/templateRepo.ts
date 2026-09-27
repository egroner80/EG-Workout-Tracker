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
