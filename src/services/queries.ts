import { db } from '../data/db'
import { getTemplate } from '../data/repositories/templateRepo'
import {
  deriveCurrentPrescriptions,
  findLastTime,
  isRealSession,
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
        if (!isRealSession(session)) return
        sessions.push(session)
        for (const targetId of Object.keys(session.recommendations ?? {})) missing.delete(targetId)
      })
    const overrides = await db.overrides.toArray()
    return { template, sessions, overrides }
  })
}

/** The newest finished real workout, the only one that can be reopened for corrections. */
export async function getLatestRealSession(): Promise<WorkoutSession | undefined> {
  let latest: WorkoutSession | undefined
  await db.sessions
    .orderBy('finishedAt')
    .reverse()
    .until(() => latest !== undefined)
    .each((session) => {
      if (isRealSession(session)) latest = session
    })
  return latest
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
  // Only earlier sessions are read, so a live query built on this ignores saves of the current workout.
  // Timestamps are whole milliseconds; an open `below` bound would still be observed inclusively by Dexie.
  await db.sessions
    .where('startedAt')
    .belowOrEqual(beforeStartedAt - 1)
    .reverse()
    .until(() => found.size === wanted.size)
    .each((session) => {
      if (!isRealSession(session)) return
      for (const exerciseId of wanted) {
        if (found.has(exerciseId)) continue
        const lastTime = findLastTime(exerciseId, [session], beforeStartedAt)
        if (lastTime) found.set(exerciseId, lastTime)
      }
    })
  return found
}
