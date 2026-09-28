import Dexie, { type EntityTable } from 'dexie'
import type { AppSettings, PrescriptionOverride, TemplateId, WorkoutSession, WorkoutTemplate } from '../domain/types'

export type PersistResult = 'granted' | 'denied' | 'unsupported'

export interface AppMeta {
  seeded: boolean
  demoSeeded: boolean
  lastBackupAt?: number
  soundCheckDone?: boolean
  installTipDismissed?: boolean
  /** The user chose to keep demo history when starting their first workout. */
  keepDemo?: boolean
  persistResult?: PersistResult
  /** Real workouts finished since the last backup; drives the backup reminder. */
  workoutsSinceBackup?: number
}

/** Each workout's template lives under its own key. */
export type TemplateKey = `template:${TemplateId}`

export function templateKey(id: TemplateId): TemplateKey {
  return `template:${id}`
}

export type KvRecord =
  | { key: TemplateKey; value: WorkoutTemplate }
  | { key: 'settings'; value: AppSettings }
  | { key: 'meta'; value: AppMeta }
  /** The single template of schema 1; startup moves it to `template:upper`. */
  | { key: 'template'; value: unknown }

export class OverloadDatabase extends Dexie {
  sessions!: EntityTable<WorkoutSession, 'id'>
  overrides!: EntityTable<PrescriptionOverride, 'id'>
  kv!: EntityTable<KvRecord, 'key'>

  constructor(name = 'overload') {
    super(name)
    // IndexedDB does not index booleans or null, so indexed flags are strings
    // or numbers. `&activeSlot` is carried only by the active session, which
    // makes it a partial unique constraint: two active workouts cannot exist.
    this.version(1).stores({
      sessions: 'id, &activeSlot, status, source, startedAt, finishedAt, deletedAt, *exerciseIds',
      overrides: 'id, targetId, createdAt',
      kv: 'key',
    })
  }
}

export const db = new OverloadDatabase()

/** Test helper: wipe and reopen the database. */
export async function resetDatabase(): Promise<void> {
  await db.delete({ disableAutoOpen: false })
}
