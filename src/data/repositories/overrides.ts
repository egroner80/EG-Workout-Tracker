import type { PrescriptionOverride } from '../../domain/types'
import { db } from '../db'

export function listOverrides(): Promise<PrescriptionOverride[]> {
  return db.overrides.toArray()
}

export async function addOverride(override: PrescriptionOverride): Promise<void> {
  await db.overrides.add(override)
}

export async function deleteOverridesForTarget(targetId: string): Promise<number> {
  return db.overrides.where('targetId').equals(targetId).delete()
}
