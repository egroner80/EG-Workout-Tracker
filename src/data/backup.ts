import {
  MigrationError,
  SCHEMA_VERSION,
  isValidSettings,
  migrateOverride,
  migrateSession,
  migrateTemplate,
} from '../domain/migrate'
import { reviseTemplate } from '../domain/templateRevisions'
import { plannedFingerprint } from '../domain/session'
import type { AppSettings, PrescriptionOverride, TemplateId, WorkoutSession, WorkoutTemplate } from '../domain/types'
import { TEMPLATE_IDS } from '../domain/workouts'

export const BACKUP_FORMAT = 'overload-backup'

/** Clock difference allowed between the device that made a backup and this one. */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  appVersion: string
  schemaVersion: number
  exportedAt: number
  counts: { sessions: number; overrides: number }
  sessions: WorkoutSession[]
  overrides: PrescriptionOverride[]
  /** Both workouts; schema-1 files carried a single `template` instead. */
  templates: WorkoutTemplate[]
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
  templates: Record<TemplateId, WorkoutTemplate>
  settings: AppSettings
}

/**
 * Everything worth keeping: all real workouts (including discarded and
 * deleted ones), manual targets, both workout templates, and settings. Demo
 * data and a workout in progress are left out; a finished workout reopened
 * for edits is saved as it was when it was finished.
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
    templates: structuredClone(TEMPLATE_IDS.map((id) => source.templates[id])),
    settings: structuredClone(source.settings),
  }
}

/**
 * Parses, validates, and migrates a backup file. Throws a readable
 * BackupError. Dates far in the future are refused: they would outrank every
 * later workout and manual target for good.
 */
export function parseBackup(text: string, now: number): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('This file is not a valid backup (it is not JSON).')
  }
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== BACKUP_FORMAT) {
    throw new BackupError('This file is not an EG Workout Tracker backup.')
  }
  const file = raw as Partial<BackupFile> & { template?: unknown }
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
  if (!isValidSettings(file.settings)) throw new BackupError('The backup has malformed settings.')
  let backup: BackupFile
  try {
    backup = {
      format: BACKUP_FORMAT,
      appVersion: String(file.appVersion ?? 'unknown'),
      schemaVersion: SCHEMA_VERSION,
      exportedAt: Number(file.exportedAt ?? 0),
      counts: file.counts,
      sessions: file.sessions.map((s) => migrateSession(s, version)),
      overrides: file.overrides.map((o) => migrateOverride(o, version)),
      templates: parseTemplates(version < 2 ? [file.template] : file.templates, version),
      settings: file.settings,
    }
  } catch (error) {
    if (error instanceof MigrationError) throw new BackupError(error.message)
    throw error
  }
  checkDates(backup, now)
  return backup
}

function parseTemplates(raw: unknown, version: number): WorkoutTemplate[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new BackupError('The backup has no workout template.')
  // A backup made before a built-in workout changed restores with the change.
  const templates = raw.map((template) => reviseTemplate(migrateTemplate(template, version)))
  if (new Set(templates.map((t) => t.id)).size !== templates.length) {
    throw new BackupError('The backup lists the same workout twice.')
  }
  return templates
}

function checkDates(backup: BackupFile, now: number): void {
  const stamps = [
    ...backup.sessions.flatMap((s) => [s.startedAt, s.finishedAt, s.updatedAt, s.createdAt, s.lastInteractionAt, s.deletedAt]),
    ...backup.overrides.flatMap((o) => [o.createdAt, o.updatedAt]),
    ...backup.templates.map((t) => t.updatedAt),
    backup.settings.updatedAt,
  ].filter((stamp): stamp is number => typeof stamp === 'number')
  if (stamps.some((stamp) => stamp < 0)) throw new BackupError('The backup has dates before 1970.')
  if (stamps.some((stamp) => stamp > now + FUTURE_TOLERANCE_MS)) {
    throw new BackupError('This backup has dates in the future.')
  }
}

interface LocalState {
  sessions: readonly WorkoutSession[]
  overrides: readonly PrescriptionOverride[]
  templates: Record<TemplateId, WorkoutTemplate>
  settings: AppSettings
}

export interface ImportPlan {
  sessionsToPut: WorkoutSession[]
  overridesToPut: PrescriptionOverride[]
  /** Workouts whose template in the backup is newer than this device's. */
  templates: WorkoutTemplate[]
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
    templates: backup.templates.filter((template) => template.updatedAt > local.templates[template.id].updatedAt),
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
