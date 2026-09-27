import type { AppSettings, PrescriptionOverride, WorkoutSession, WorkoutTemplate } from './types'

/**
 * Record-level schema versioning shared by database upgrades, startup
 * validation, and backup import. Transforms are pure and keep unknown fields.
 *
 * Policy for later versions: changes are additive, primary keys never change,
 * and every version adds a transform here plus fixture tests upgrading from
 * each earlier version.
 */
export const SCHEMA_VERSION = 1

export class MigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationError'
  }
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function isValidSession(value: unknown): value is WorkoutSession {
  if (!isRecord(value)) return false
  const statusOk = value.status === 'active' || value.status === 'completed' || value.status === 'discarded'
  const sourceOk = value.source === 'real' || value.source === 'demo'
  if (!isString(value.id) || !statusOk || !sourceOk) return false
  if (!isNumber(value.rev) || !isNumber(value.startedAt) || !isNumber(value.updatedAt)) return false
  if (!Array.isArray(value.warmup) || !Array.isArray(value.exercises) || !Array.isArray(value.exerciseIds)) return false
  const exercisesOk = value.exercises.every(
    (e) =>
      isRecord(e) &&
      isString(e.exerciseId) &&
      (e.kind === 'reps' || e.kind === 'carry') &&
      isRecord(e.planned) &&
      Array.isArray(e.actual),
  )
  if (!exercisesOk) return false
  if (value.status === 'completed' && (!isRecord(value.recommendations) || !isNumber(value.finishedAt))) return false
  if (value.status === 'active' && !isRecord(value.runtime)) return false
  return true
}

export function isValidOverride(value: unknown): value is PrescriptionOverride {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.targetId) &&
    isRecord(value.prescription) &&
    isNumber(value.createdAt) &&
    isNumber(value.updatedAt)
  )
}

export function isValidTemplate(value: unknown): value is WorkoutTemplate {
  return (
    isRecord(value) &&
    value.id === 'default' &&
    Array.isArray(value.warmup) &&
    Array.isArray(value.exercises) &&
    value.exercises.every((e) => isRecord(e) && isString(e.id) && (e.kind === 'reps' || e.kind === 'carry')) &&
    isNumber(value.updatedAt)
  )
}

export function isValidSettings(value: unknown): value is AppSettings {
  return isRecord(value) && typeof value.sound === 'boolean' && isNumber(value.updatedAt)
}

/** Upgrades a session record written by `fromVersion` to the current schema. */
export function migrateSession(record: unknown, fromVersion: number): WorkoutSession {
  if (fromVersion > SCHEMA_VERSION) {
    throw new MigrationError('This data was written by a newer version of the app. Update the app first.')
  }
  // Version 1 is the first schema; later versions add transforms here, in order.
  if (!isValidSession(record)) throw new MigrationError('A workout record is malformed.')
  return record
}

export function migrateOverride(record: unknown, fromVersion: number): PrescriptionOverride {
  if (fromVersion > SCHEMA_VERSION) {
    throw new MigrationError('This data was written by a newer version of the app. Update the app first.')
  }
  if (!isValidOverride(record)) throw new MigrationError('A manual target record is malformed.')
  return record
}
