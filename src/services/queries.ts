import { db } from '../data/db'
import { getTemplate } from '../data/repositories/templateRepo'
import {
  deriveCurrentPrescriptions,
  findLastTime,
  type LastTime,
  type ResolvedPrescription,
} from '../domain/prescription'
import { isProgressiveStep } from '../domain/progression/warmup'
import type { PrescriptionOverride, WorkoutSession, WorkoutTemplate } from '../domain/types'

export interface PrescriptionContext {
  template: WorkoutTemplate
  /** Finished real sessions, newest first, read only as far as every target needs. */
  sessions: WorkoutSession[]
  overrides: PrescriptionOverride[]
}

const isRealHistory = (s: WorkoutSession) => s.status === 'completed' && s.source === 'real' && s.deletedAt === undefined

/**
 * Reads everything derivation needs in one read transaction, scanning finished
 * sessions newest-first and stopping once every target has a recommendation.
 */
export async function loadPrescriptionContext(): Promise<PrescriptionContext> {
  return db.transaction('r', db.kv, db.sessions, db.overrides, async () => {
    const template = await getTemplate()
    const missing = new Set([
      ...template.exercises.map((e) => e.id),
      ...template.warmup.filter(isProgressiveStep).map((s) => s.id),
    ])
    const sessions: WorkoutSession[] = []
    await db.sessions
      .orderBy('finishedAt')
      .reverse()
      .until(() => missing.size === 0)
      .each((session) => {
        if (!isRealHistory(session)) return
        sessions.push(session)
        for (const targetId of Object.keys(session.recommendations ?? {})) missing.delete(targetId)
      })
    const overrides = await db.overrides.toArray()
    return { template, sessions, overrides }
  })
}

export async function getCurrentPrescriptions(): Promise<Map<string, ResolvedPrescription>> {
  return deriveCurrentPrescriptions(await loadPrescriptionContext())
}

/** LAST TIME for each exercise: the newest earlier real workout where it had a done set. */
export async function loadLastTimes(
  exerciseIds: readonly string[],
  beforeStartedAt = Number.POSITIVE_INFINITY,
): Promise<Map<string, LastTime>> {
  const wanted = new Set(exerciseIds)
  const found = new Map<string, LastTime>()
  await db.sessions
    .orderBy('startedAt')
    .reverse()
    .until(() => found.size === wanted.size)
    .each((session) => {
      if (!isRealHistory(session) || session.startedAt >= beforeStartedAt) return
      for (const exerciseId of wanted) {
        if (found.has(exerciseId)) continue
        const lastTime = findLastTime(exerciseId, [session], beforeStartedAt)
        if (lastTime) found.set(exerciseId, lastTime)
      }
    })
  return found
}
