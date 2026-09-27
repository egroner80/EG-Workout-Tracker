import { buildBackup, parseBackup, planImport, type BackupFile, type ImportPlan } from '../data/backup'
import { db } from '../data/db'
import { newId } from '../data/ids'
import { deleteDemoSessions, getActiveSession, transitionSession } from '../data/repositories/sessions'
import { getSettings, updateMeta } from '../data/repositories/settingsRepo'
import { getTemplate } from '../data/repositories/templateRepo'
import { deriveCurrentPrescriptions } from '../domain/prescription'
import { softDeleteSession } from '../domain/session'
import type { Prescription, PrescriptionOverride } from '../domain/types'
import { loadPrescriptionContext } from './queries'

export class WorkoutActiveError extends Error {
  constructor() {
    super('Finish or discard the workout in progress to change next targets.')
    this.name = 'WorkoutActiveError'
  }
}

/**
 * Saves a manual next target. It applies until a newer workout containing the
 * target finishes, and records the recommendation it replaced so a later
 * re-finish can offer "Use suggestion".
 */
export async function createOverride(
  targetId: string,
  prescription: Prescription,
  now: number,
): Promise<PrescriptionOverride> {
  if (await getActiveSession()) throw new WorkoutActiveError()
  const context = await loadPrescriptionContext()
  const resolved = deriveCurrentPrescriptions(context).get(targetId)
  const override: PrescriptionOverride = {
    id: newId(),
    targetId,
    prescription: structuredClone(prescription),
    ...(resolved?.recommendation ? { replacedRecommendation: resolved.recommendation.prescription } : {}),
    createdAt: now,
    updatedAt: now,
  }
  await db.overrides.add(override)
  return override
}

/** Drops manual targets for a target so the stored recommendation applies again. */
export async function useSuggestion(targetId: string): Promise<void> {
  await db.overrides.where('targetId').equals(targetId).delete()
}

/** Soft-deletes a finished workout; targets fall back to the previous one. */
export async function deleteWorkout(sessionId: string, now: number): Promise<void> {
  await transitionSession(sessionId, (session) => softDeleteSession(session, now))
}

export async function clearDemoData(): Promise<number> {
  return deleteDemoSessions()
}

export async function createBackup(now: number): Promise<BackupFile> {
  return db.transaction('r', db.sessions, db.overrides, db.kv, async () => {
    const [sessions, overrides, template, settings] = await Promise.all([
      db.sessions.toArray(),
      db.overrides.toArray(),
      getTemplate(),
      getSettings(),
    ])
    return buildBackup({ sessions, overrides, template, settings }, now, __APP_VERSION__)
  })
}

/** Called once the share sheet (or download) actually delivered the file. */
export async function recordBackup(now: number): Promise<void> {
  await updateMeta({ lastBackupAt: now, workoutsSinceBackup: 0 })
}

/** Parses a backup and plans the merge without writing anything. */
export async function previewImport(text: string): Promise<ImportPlan> {
  const backup = parseBackup(text)
  const [sessions, overrides, template, settings] = await Promise.all([
    db.sessions.toArray(),
    db.overrides.toArray(),
    getTemplate(),
    getSettings(),
  ])
  return planImport(backup, { sessions, overrides, template, settings })
}

/** Writes a previewed import in one transaction. */
export async function applyImport(plan: ImportPlan): Promise<void> {
  await db.transaction('rw', db.sessions, db.overrides, db.kv, async () => {
    const activeIds = new Set((await db.sessions.where('activeSlot').equals('active').primaryKeys()).map(String))
    const sessions = plan.sessionsToPut.filter((s) => !activeIds.has(s.id) && s.status !== 'active')
    if (sessions.length) await db.sessions.bulkPut(sessions)
    if (plan.overridesToPut.length) await db.overrides.bulkPut(plan.overridesToPut)
    if (plan.template) await db.kv.put({ key: 'template', value: plan.template })
    if (plan.settings) await db.kv.put({ key: 'settings', value: plan.settings })
  })
}
