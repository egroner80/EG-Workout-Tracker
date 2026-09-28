import { insertSquatRoutine } from './sharedWarmup'
import type {
  AppSettings,
  Prescription,
  PrescriptionOverride,
  WarmupStepDef,
  WorkoutSession,
  WorkoutTemplate,
} from './types'
import { isTemplateId } from './workouts'

/**
 * Record-level schema versioning shared by startup, the active-workout
 * mirror, and backup import. Transforms are pure and keep unknown fields.
 *
 * Policy for later versions: changes are additive, primary keys never change,
 * and every version adds a transform here plus fixture tests upgrading from
 * each earlier version.
 *
 * Version 2 adds the lower-body workout: templates are keyed 'upper' | 'lower'
 * (the single v1 template becomes upper and gains the squat routine) and
 * workouts record their type (v1 workouts were upper body).
 */
export const SCHEMA_VERSION = 2

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
const isText = (v: unknown): v is string => typeof v === 'string'
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean'
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
const isPositiveCount = (v: unknown): v is number => isCount(v) && v > 0
const isOptional = (v: unknown, check: (x: unknown) => boolean) => v === undefined || check(v)
const isLoadType = (v: unknown) => v === 'dumbbell' || v === 'weight' || v === 'bodyweight'
const isSetStatus = (v: unknown) => v === 'pending' || v === 'done' || v === 'skipped'
const isSide = (v: unknown) => v === 'L' || v === 'R'
const isCarryStyle = (v: unknown) => v === 'hold'
const allOf = (v: unknown, check: (x: unknown) => boolean) => Array.isArray(v) && v.every(check)

/*
 * Validators go as deep as the app reads. A backup file or a tampered stored
 * record that passes them cannot crash target derivation or rendering later.
 */

export function isValidPrescription(value: unknown): value is Prescription {
  if (!isRecord(value)) return false
  switch (value.kind) {
    case 'reps':
      return isNumber(value.loadKg) && Array.isArray(value.reps) && value.reps.length > 0 && value.reps.every(isCount)
    case 'timed':
      return isNumber(value.loadKg) && isNumber(value.seconds) && isPositiveCount(value.setsPerSide)
    case 'warmup':
      return isNumber(value.durationSec) && isBoolean(value.active)
    default:
      return false
  }
}

function isValidStaircase(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.type === 'staircase' &&
    isPositiveCount(value.sets) &&
    isPositiveCount(value.minReps) &&
    isPositiveCount(value.maxReps) &&
    value.minReps <= value.maxReps
  )
}

function isValidTimedScheme(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.type === 'timed' &&
    isPositiveCount(value.setsPerSide) &&
    isNumber(value.minSec) &&
    isNumber(value.maxSec) &&
    isNumber(value.stepSec) &&
    value.minSec > 0 &&
    value.minSec <= value.maxSec &&
    value.stepSec > 0
  )
}

function isValidProgression(value: unknown): boolean {
  return isRecord(value) && isNumber(value.stepSec) && isNumber(value.maxSec)
}

function isValidActivation(value: unknown): boolean {
  return isRecord(value) && isString(value.afterStepId) && isNumber(value.whenDurationReachesSec)
}

function hasExerciseBasics(value: UnknownRecord): boolean {
  return (
    isString(value.name) &&
    isString(value.shortName) &&
    isLoadType(value.loadType) &&
    isNumber(value.loadStepKg) &&
    value.loadStepKg > 0 &&
    isBoolean(value.perSide) &&
    isNumber(value.restSec)
  )
}

function isValidExerciseDef(value: unknown): boolean {
  if (!isRecord(value) || !isString(value.id) || !hasExerciseBasics(value)) return false
  const baseline = value.baseline
  if (!isValidPrescription(baseline)) return false
  if (value.kind === 'reps') return isValidStaircase(value.scheme) && baseline.kind === 'reps'
  if (value.kind === 'carry') {
    return isValidTimedScheme(value.scheme) && baseline.kind === 'timed' && isOptional(value.style, isCarryStyle)
  }
  return false
}

/** Optional rep count, sides, and flow group, shared by warm-up definitions and logs. */
function hasValidStepShape(value: UnknownRecord): boolean {
  return (
    isOptional(value.reps, isPositiveCount) &&
    isOptional(value.perSide, isBoolean) &&
    isOptional(value.flowGroup, isString)
  )
}

function isValidWarmupStepDef(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isOptional(value.cue, isText) &&
    isNumber(value.durationSec) &&
    value.durationSec > 0 &&
    isOptional(value.progression, isValidProgression) &&
    isOptional(value.activation, isValidActivation) &&
    hasValidStepShape(value)
  )
}

function isValidActualSet(value: unknown): boolean {
  return isRecord(value) && isNumber(value.reps) && isNumber(value.loadKg) && isSetStatus(value.status)
}

function isValidEffort(value: unknown, withLoad: boolean): boolean {
  if (!isRecord(value) || !isSide(value.side) || !isCount(value.setIndex) || !isNumber(value.seconds)) return false
  return !withLoad || (isNumber(value.loadKg) && isSetStatus(value.status))
}

function isValidExerciseLog(value: unknown): boolean {
  if (!isRecord(value) || !isString(value.exerciseId) || !hasExerciseBasics(value)) return false
  const planned = value.planned
  if (!isRecord(planned) || !isNumber(planned.loadKg)) return false
  if (value.kind === 'reps') {
    return (
      isValidStaircase(value.scheme) &&
      allOf(planned.sets, (set) => isRecord(set) && isCount(set.reps)) &&
      allOf(value.actual, isValidActualSet)
    )
  }
  if (value.kind === 'carry') {
    return (
      isValidTimedScheme(value.scheme) &&
      (value.mode === 'carry' || value.mode === 'march' || value.mode === 'hold') &&
      isOptional(value.style, isCarryStyle) &&
      isNumber(planned.seconds) &&
      allOf(planned.efforts, (effort) => isValidEffort(effort, false)) &&
      allOf(value.actual, (effort) => isValidEffort(effort, true))
    )
  }
  return false
}

function isValidWarmupLog(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.stepId) &&
    isString(value.name) &&
    isOptional(value.cue, isText) &&
    isNumber(value.plannedSec) &&
    isBoolean(value.active) &&
    isNumber(value.elapsedMs) &&
    isBoolean(value.completed) &&
    isBoolean(value.skipped) &&
    isOptional(value.progression, isValidProgression) &&
    isOptional(value.activation, isValidActivation) &&
    hasValidStepShape(value)
  )
}

function isValidTimer(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumber(value.durationMs) &&
    isBoolean(value.running) &&
    isNumber(value.endsAt) &&
    isNumber(value.remainingMs)
  )
}

const isNullableTimer = (value: unknown) => value === null || value === undefined || isValidTimer(value)

function isValidRuntime(value: unknown): boolean {
  if (!isRecord(value)) return false
  const { warmup, rest, effort } = value
  return (
    (value.phase === 'warmup' || value.phase === 'warmup-complete' || value.phase === 'strength') &&
    typeof value.currentExerciseId === 'string' &&
    isRecord(warmup) &&
    isCount(warmup.index) &&
    isNullableTimer(warmup.timer) &&
    isNullableTimer(warmup.getReady) &&
    (rest === null || rest === undefined || (isRecord(rest) && isString(rest.exerciseId) && isValidTimer(rest.timer))) &&
    (effort === null ||
      effort === undefined ||
      (isRecord(effort) && isString(effort.exerciseId) && isCount(effort.effortIndex) && isValidTimer(effort.timer)))
  )
}

function isValidRecommendation(value: unknown): boolean {
  return isRecord(value) && isString(value.targetId) && isString(value.outcome) && isValidPrescription(value.prescription)
}

export function isValidSession(value: unknown): value is WorkoutSession {
  if (!isRecord(value)) return false
  const statusOk = value.status === 'active' || value.status === 'completed' || value.status === 'discarded'
  const sourceOk = value.source === 'real' || value.source === 'demo'
  if (!isString(value.id) || !statusOk || !sourceOk) return false
  if (!isOptional(value.templateId, isTemplateId)) return false
  if (!isNumber(value.rev) || !isNumber(value.startedAt) || !isNumber(value.updatedAt)) return false
  if (!isOptional(value.finishedAt, isNumber) || !isOptional(value.deletedAt, isNumber)) return false
  // Only an active workout may hold the unique active slot; anything else would lock out Start.
  if (value.activeSlot !== undefined && (value.status !== 'active' || value.activeSlot !== 'active')) return false
  if (!allOf(value.warmup, isValidWarmupLog) || !allOf(value.exercises, isValidExerciseLog)) return false
  if (!allOf(value.exerciseIds, isString)) return false
  if (value.recommendations !== undefined) {
    if (!isRecord(value.recommendations) || !Object.values(value.recommendations).every(isValidRecommendation)) return false
  }
  if (value.status === 'completed' && (!isRecord(value.recommendations) || !isNumber(value.finishedAt))) return false
  if (value.status === 'active' && !isValidRuntime(value.runtime)) return false
  return true
}

export function isValidOverride(value: unknown): value is PrescriptionOverride {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.targetId) &&
    isValidPrescription(value.prescription) &&
    isOptional(value.replacedRecommendation, isValidPrescription) &&
    isNumber(value.createdAt) &&
    isNumber(value.updatedAt)
  )
}

const uniqueIds = (items: readonly unknown[]) => new Set(items.map((item) => (item as { id: string }).id)).size === items.length

export function isValidTemplate(value: unknown): value is WorkoutTemplate {
  return (
    isRecord(value) &&
    isTemplateId(value.id) &&
    allOf(value.warmup, isValidWarmupStepDef) &&
    allOf(value.exercises, isValidExerciseDef) &&
    (value.exercises as unknown[]).length > 0 &&
    uniqueIds(value.warmup as unknown[]) &&
    uniqueIds(value.exercises as unknown[]) &&
    isNumber(value.updatedAt)
  )
}

export function isValidSettings(value: unknown): value is AppSettings {
  return (
    isRecord(value) &&
    isBoolean(value.sound) &&
    isBoolean(value.alwaysAudible) &&
    isBoolean(value.vibration) &&
    isBoolean(value.getReadyCountdown) &&
    isBoolean(value.keepScreenAwake) &&
    (value.theme === 'dark' || value.theme === 'light') &&
    isNumber(value.updatedAt)
  )
}

function refuseNewer(fromVersion: number): void {
  if (fromVersion > SCHEMA_VERSION) {
    throw new MigrationError('This data was written by a newer version of the app. Update the app first.')
  }
}

/** v1 → v2: every workout before the lower-body workout existed was upper body. */
function typeAsUpper(record: UnknownRecord): UnknownRecord {
  const typed = record.templateId === undefined ? { ...record, templateId: 'upper' } : record
  const snapshot = typed.reopenSnapshot
  return isRecord(snapshot) && snapshot.templateId === undefined
    ? { ...typed, reopenSnapshot: { ...snapshot, templateId: 'upper' } }
    : typed
}

/** Upgrades a session record written by `fromVersion` to the current schema. */
export function migrateSession(record: unknown, fromVersion: number): WorkoutSession {
  refuseNewer(fromVersion)
  const current = fromVersion < 2 && isRecord(record) ? typeAsUpper(record) : record
  if (!isValidSession(current)) throw new MigrationError('A workout record is malformed.')
  return current
}

export function migrateOverride(record: unknown, fromVersion: number): PrescriptionOverride {
  refuseNewer(fromVersion)
  if (!isValidOverride(record)) throw new MigrationError('A manual target record is malformed.')
  return record
}

/**
 * Upgrades a template written by `fromVersion`. The single v1 template becomes
 * the upper-body workout with the squat routine; `updatedAt` is kept because
 * this is a schema change, not an edit.
 */
export function migrateTemplate(record: unknown, fromVersion: number): WorkoutTemplate {
  refuseNewer(fromVersion)
  const legacy = fromVersion < 2 && isRecord(record) && record.id === 'default' && allOf(record.warmup, isValidWarmupStepDef)
  const current = legacy
    ? { ...record, id: 'upper', warmup: insertSquatRoutine(record.warmup as WarmupStepDef[]) }
    : record
  if (!isValidTemplate(current)) throw new MigrationError('The workout template is malformed.')
  return current
}
