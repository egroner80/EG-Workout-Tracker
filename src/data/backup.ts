import {
  MigrationError,
  SCHEMA_VERSION,
  isValidSettings,
  isValidTemplate,
  migrateOverride,
  migrateSession,
} from '../domain/migrate'
import { plannedFingerprint } from '../domain/session'
import type { AppSettings, PrescriptionOverride, WorkoutSession, WorkoutTemplate } from '../domain/types'

export const BACKUP_FORMAT = 'overload-backup'

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  appVersion: string
  schemaVersion: number
  exportedAt: number
  counts: { sessions: number; overrides: number }
  sessions: WorkoutSession[]
  overrides: PrescriptionOverride[]
  template: WorkoutTemplate
  settings: AppSettings
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupError'
  }
}

interface BackupSource {
  sessions: readonly WorkoutSession[]
  overrides: readonly PrescriptionOverride[]
  template: WorkoutTemplate
  settings: AppSettings
}

/**
 * Everything worth keeping: all real workouts (including discarded and
 * deleted ones), manual targets, the template, and settings. Demo data and a
 * workout in progress are left out; a finished workout reopened for edits is
 * saved as it was when it was finished.
 */
export function buildBackup(source: BackupSource, now: number, appVersion: string): BackupFile {
  const sessions = source.sessions.flatMap((s): WorkoutSession[] => {
    if (s.source !== 'real') return []
    if (s.status !== 'active') return [s]
    return s.reopenSnapshot ? [s.reopenSnapshot] : []
  })
  return {
    format: BACKUP_FORMAT,
    appVersion,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    counts: { sessions: sessions.length, overrides: source.overrides.length },
    sessions: structuredClone(sessions),
    overrides: structuredClone([...source.overrides]),
    template: structuredClone(source.template),
    settings: structuredClone(source.settings),
  }
}

/** Parses, validates, and migrates a backup file. Throws a readable BackupError. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('This file is not a valid backup (it is not JSON).')
  }
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== BACKUP_FORMAT) {
    throw new BackupError('This file is not an Overload backup.')
  }
  const file = raw as Partial<BackupFile>
  const version = typeof file.schemaVersion === 'number' ? file.schemaVersion : NaN
  if (!Number.isFinite(version)) throw new BackupError('The backup has no schema version.')
  if (version > SCHEMA_VERSION) {
    throw new BackupError('This backup was made by a newer version of the app. Update the app first.')
  }
  if (!Array.isArray(file.sessions) || !Array.isArray(file.overrides) || !file.counts) {
    throw new BackupError('The backup is incomplete.')
  }
  if (file.counts.sessions !== file.sessions.length || file.counts.overrides !== file.overrides.length) {
    throw new BackupError('The backup looks truncated: its record counts do not match.')
  }
  if (!isValidTemplate(file.template) || !isValidSettings(file.settings)) {
    throw new BackupError('The backup has a malformed template or settings.')
  }
  try {
    return {
      format: BACKUP_FORMAT,
      appVersion: String(file.appVersion ?? 'unknown'),
      schemaVersion: SCHEMA_VERSION,
      exportedAt: Number(file.exportedAt ?? 0),
      counts: file.counts,
      sessions: file.sessions.map((s) => migrateSession(s, version)),
      overrides: file.overrides.map((o) => migrateOverride(o, version)),
      template: file.template,
      settings: file.settings,
    }
  } catch (error) {
    if (error instanceof MigrationError) throw new BackupError(error.message)
    throw error
  }
}

interface LocalState {
  sessions: readonly WorkoutSession[]
  overrides: readonly PrescriptionOverride[]
  template: WorkoutTemplate
  settings: AppSettings
}

export interface ImportPlan {
  sessionsToPut: WorkoutSession[]
  overridesToPut: PrescriptionOverride[]
  template?: WorkoutTemplate
  settings?: AppSettings
  /** Same workout id with different planned values; the local copy was kept. */
  conflicts: string[]
  preview: {
    workouts: number
    newWorkouts: number
    updatedWorkouts: number
    skippedWorkouts: number
    firstWorkoutAt?: number
    lastWorkoutAt?: number
    overrides: number
  }
}

/** Imported workouts are finished records: fields only an active workout carries are dropped. */
function finishedRecord(session: WorkoutSession): WorkoutSession {
  const { activeSlot: _activeSlot, runtime: _runtime, reopenSnapshot: _reopenSnapshot, ...record } = session
  return record
}

/**
 * Merge rules: the newer `updatedAt` wins and ties keep the local copy
 * (deletes bump `updatedAt`, so an old backup cannot resurrect a deleted
 * workout). Active and demo sessions are never imported, and the local
 * active workout is never touched.
 */
export function planImport(backup: BackupFile, local: LocalState): ImportPlan {
  const localById = new Map(local.sessions.map((s) => [s.id, s]))
  const sessionsToPut: WorkoutSession[] = []
  const conflicts: string[] = []
  let newWorkouts = 0
  let updatedWorkouts = 0
  let skippedWorkouts = 0

  for (const incoming of backup.sessions) {
    if (incoming.status === 'active' || incoming.source === 'demo') {
      skippedWorkouts++
      continue
    }
    const existing = localById.get(incoming.id)
    if (!existing) {
      sessionsToPut.push(finishedRecord(incoming))
      newWorkouts++
      continue
    }
    if (existing.status === 'active' || existing.updatedAt >= incoming.updatedAt) {
      skippedWorkouts++
      continue
    }
    if (plannedFingerprint(existing) !== plannedFingerprint(incoming)) {
      conflicts.push(incoming.id)
      skippedWorkouts++
      continue
    }
    sessionsToPut.push(finishedRecord(incoming))
    updatedWorkouts++
  }

  const localOverrides = new Map(local.overrides.map((o) => [o.id, o]))
  const overridesToPut = backup.overrides.filter((o) => {
    const existing = localOverrides.get(o.id)
    return !existing || existing.updatedAt < o.updatedAt
  })

  const starts = backup.sessions.filter((s) => s.source === 'real').map((s) => s.startedAt)
  return {
    sessionsToPut,
    overridesToPut,
    ...(backup.template.updatedAt > local.template.updatedAt ? { template: backup.template } : {}),
    ...(backup.settings.updatedAt > local.settings.updatedAt ? { settings: backup.settings } : {}),
    conflicts,
    preview: {
      workouts: backup.sessions.length,
      newWorkouts,
      updatedWorkouts,
      skippedWorkouts,
      ...(starts.length ? { firstWorkoutAt: Math.min(...starts), lastWorkoutAt: Math.max(...starts) } : {}),
      overrides: overridesToPut.length,
    },
  }
}
