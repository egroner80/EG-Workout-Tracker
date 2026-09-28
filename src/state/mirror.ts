import { SCHEMA_VERSION, migrateSession } from '../domain/migrate'
import type { WorkoutSession } from '../domain/types'

/**
 * A synchronous copy of the active workout in localStorage. IndexedDB writes
 * are asynchronous, so a phone killing the app right after a tap could lose
 * that tap; this copy survives it. Hydration uses it only under strict rules
 * (see the store) and every terminal transition clears it.
 */
const KEY = 'overload.active-workout'

interface MirrorRecord {
  schemaVersion: number
  session: WorkoutSession
}

export function writeMirror(session: WorkoutSession): void {
  try {
    const record: MirrorRecord = { schemaVersion: SCHEMA_VERSION, session }
    localStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    // Storage full or unavailable: IndexedDB remains the source of truth.
  }
}

export function readMirror(): WorkoutSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const record = JSON.parse(raw) as Partial<MirrorRecord>
    const session = migrateSession(record.session, Number(record.schemaVersion ?? SCHEMA_VERSION))
    return session.status === 'active' ? session : null
  } catch {
    return null
  }
}

export function clearMirror(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}
