import { db, type AppMeta } from '../data/db'
import { newId } from '../data/ids'
import { insertActiveSession } from '../data/repositories/sessions'
import { deriveCurrentPrescriptions } from '../domain/prescription'
import {
  SessionStateError,
  buildSession,
  cancelEdits,
  discardSession,
  finishSession,
  reopenSession,
  resolvePending,
  type PendingResolution,
} from '../domain/session'
import type { WorkoutSession } from '../domain/types'
import { getLatestRealSession, loadPrescriptionContext } from './queries'

/** Snapshots today's plan from the current targets and inserts it as the one active workout. */
export async function startWorkout(now: number): Promise<WorkoutSession> {
  const context = await loadPrescriptionContext()
  const session = buildSession({
    id: newId(),
    now,
    template: context.template,
    prescriptions: deriveCurrentPrescriptions(context),
  })
  await insertActiveSession(session)
  return session
}

async function bumpWorkoutsSinceBackup(): Promise<void> {
  const record = await db.kv.get('meta')
  const meta: AppMeta = record?.key === 'meta' ? record.value : { seeded: true, demoSeeded: true }
  await db.kv.put({ key: 'meta', value: { ...meta, workoutsSinceBackup: (meta.workoutsSinceBackup ?? 0) + 1 } })
}

export interface FinishInput {
  sessionId: string
  resolutions: Record<string, PendingResolution>
  now: number
  stale?: boolean
}

/** Resolves pending sets, evaluates, and completes the stored workout in one transaction. */
export async function finishWorkout({ sessionId, resolutions, now, stale = false }: FinishInput): Promise<WorkoutSession> {
  return db.transaction('rw', db.sessions, db.kv, async () => {
    const current = await db.sessions.get(sessionId)
    if (!current || current.status !== 'active') throw new SessionStateError('This workout is no longer in progress')
    const finished = finishSession(resolvePending(current, resolutions), { now, stale })
    finished.rev = Math.max(finished.rev, current.rev + 1)
    await db.sessions.put(finished)
    if (finished.source === 'real' && !current.reopenSnapshot) await bumpWorkoutsSinceBackup()
    return finished
  })
}

/** Reopens the latest real workout for corrections when nothing else is in progress. */
export async function reopenWorkout(sessionId: string, now: number): Promise<WorkoutSession> {
  return db.transaction('rw', db.sessions, async () => {
    if (await db.sessions.where('activeSlot').equals('active').first()) {
      throw new SessionStateError('Finish or discard the workout in progress first')
    }
    const latest = await getLatestRealSession()
    if (!latest || latest.id !== sessionId) throw new SessionStateError('Only the latest workout can be edited')
    const reopened = reopenSession(latest, now)
    await db.sessions.put(reopened)
    return reopened
  })
}

export async function cancelWorkoutEdits(sessionId: string, now: number): Promise<WorkoutSession> {
  return db.transaction('rw', db.sessions, async () => {
    const current = await db.sessions.get(sessionId)
    if (!current) throw new SessionStateError('Workout not found')
    const restored = cancelEdits(current, now)
    await db.sessions.put(restored)
    return restored
  })
}

export async function discardWorkout(sessionId: string, now: number): Promise<WorkoutSession> {
  return db.transaction('rw', db.sessions, async () => {
    const current = await db.sessions.get(sessionId)
    if (!current) throw new SessionStateError('Workout not found')
    const discarded = discardSession(current, now)
    await db.sessions.put(discarded)
    return discarded
  })
}
