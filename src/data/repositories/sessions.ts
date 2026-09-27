import { plannedFingerprint } from '../../domain/session'
import type { WorkoutSession } from '../../domain/types'
import { db } from '../db'

export type GuardReason = 'missing' | 'not-active' | 'stale' | 'planned-changed'

/**
 * A save the repository refused. The caller should reload the stored record
 * rather than retry: retrying a stale or finished copy would overwrite newer data.
 */
export class GuardRejection extends Error {
  readonly reason: GuardReason
  constructor(reason: GuardReason) {
    super(`Save rejected: ${reason}`)
    this.name = 'GuardRejection'
    this.reason = reason
  }
}

export class ActiveSessionExistsError extends Error {
  constructor() {
    super('A workout is already in progress')
    this.name = 'ActiveSessionExistsError'
  }
}

export function getSession(id: string): Promise<WorkoutSession | undefined> {
  return db.sessions.get(id)
}

export function getActiveSession(): Promise<WorkoutSession | undefined> {
  return db.sessions.where('activeSlot').equals('active').first()
}

/** Finished workouts shown in History, newest first. */
export async function listHistory(): Promise<WorkoutSession[]> {
  const sessions = await db.sessions.where('status').equals('completed').toArray()
  return sessions
    .filter((s) => s.deletedAt === undefined)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
}

export async function hasDemoSessions(): Promise<boolean> {
  return (await db.sessions.where('source').equals('demo').count()) > 0
}

/** Inserts a new active workout; refuses when one already exists. */
export async function insertActiveSession(session: WorkoutSession): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const existing = await db.sessions.where('activeSlot').equals('active').first()
    if (existing) throw new ActiveSessionExistsError()
    await db.sessions.add(session)
  })
}

/**
 * Saves a newer snapshot of the active workout. Rejects stale revisions,
 * writes to records that are no longer active, and any change to planned values.
 */
export async function saveActiveSession(session: WorkoutSession): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const current = await db.sessions.get(session.id)
    if (!current) throw new GuardRejection('missing')
    if (current.status !== 'active') throw new GuardRejection('not-active')
    if (current.rev >= session.rev) throw new GuardRejection('stale')
    if (plannedFingerprint(current) !== plannedFingerprint(session)) throw new GuardRejection('planned-changed')
    await db.sessions.put(session)
  })
}

/**
 * Applies a status change (finish, discard, reopen, cancel edits, delete) to
 * the stored record inside one transaction, re-reading it first.
 */
export async function transitionSession(
  id: string,
  transform: (current: WorkoutSession) => WorkoutSession,
): Promise<WorkoutSession> {
  return db.transaction('rw', db.sessions, async () => {
    const current = await db.sessions.get(id)
    if (!current) throw new GuardRejection('missing')
    const next = transform(current)
    if (next.rev <= current.rev) next.rev = current.rev + 1
    await db.sessions.put(next)
    return next
  })
}

export async function deleteDemoSessions(): Promise<number> {
  return db.sessions.where('source').equals('demo').delete()
}
