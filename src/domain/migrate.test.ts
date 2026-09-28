import { describe, expect, it } from 'vitest'
import { createDefaultTemplate } from '../data/seed/defaultTemplate'
import {
  MigrationError,
  SCHEMA_VERSION,
  isValidSession,
  isValidTemplate,
  migrateSession,
  migrateTemplate,
} from './migrate'
import { buildSession, finishSession, reopenSession } from './session'
import { SQUAT_ROUTINE } from './sharedWarmup'
import type { WarmupStepDef, WorkoutSession, WorkoutTemplate } from './types'

const session = buildSession({ id: 's1', now: 1, template: createDefaultTemplate(), prescriptions: new Map() })
const completed = finishSession(session, { now: 2 })
const squatIds = SQUAT_ROUTINE.map((step) => step.id)

/** A workout as schema 1 wrote it: no workout type. */
function v1Session(record: WorkoutSession): Record<string, unknown> {
  const { templateId: _templateId, ...rest } = structuredClone(record)
  if (rest.reopenSnapshot) delete (rest.reopenSnapshot as Partial<WorkoutSession>).templateId
  return rest
}

/** The single template as schema 1 stored it. */
function v1Template(warmup?: WarmupStepDef[]): Record<string, unknown> {
  const template = createDefaultTemplate()
  return {
    ...template,
    id: 'default',
    warmup: warmup ?? template.warmup.filter((step) => !squatIds.includes(step.id)),
    updatedAt: 5,
  }
}

const warmupIds = (template: WorkoutTemplate) => template.warmup.map((step) => step.id)

describe('migrateSession', () => {
  it('accepts a current-version session unchanged', () => {
    expect(migrateSession(structuredClone(session), SCHEMA_VERSION)).toEqual(session)
  })

  it('refuses data from a newer schema version', () => {
    expect(() => migrateSession(session, SCHEMA_VERSION + 1)).toThrow(MigrationError)
  })

  it('rejects malformed records', () => {
    expect(() => migrateSession({ id: 's1' }, SCHEMA_VERSION)).toThrow(MigrationError)
  })

  it('marks a schema-1 workout as upper body and keeps every other field', () => {
    const legacy = { ...v1Session(completed), unknownField: 'kept' }
    expect(migrateSession(legacy, 1)).toEqual({ ...legacy, templateId: 'upper' })
  })

  it('marks the finished copy inside a reopened schema-1 workout too', () => {
    const migrated = migrateSession(v1Session(reopenSession(completed, 3)), 1)
    expect(migrated.templateId).toBe('upper')
    expect(migrated.reopenSnapshot?.templateId).toBe('upper')
  })

  it('keeps the type of a current-version lower-body workout', () => {
    const lower = { ...structuredClone(completed), templateId: 'lower' as const }
    expect(migrateSession(lower, SCHEMA_VERSION).templateId).toBe('lower')
  })
})

describe('migrateTemplate', () => {
  it('turns the schema-1 template into the upper-body workout with the squat routine after the jump rope', () => {
    const migrated = migrateTemplate(v1Template(), 1)
    expect(migrated.id).toBe('upper')
    expect(migrated.updatedAt).toBe(5)
    expect(warmupIds(migrated).slice(0, 2 + squatIds.length)).toEqual(['jump-rope', 'double-unders', ...squatIds])
    expect(warmupIds(migrated).slice(2 + squatIds.length)).toEqual(
      warmupIds(v1Template() as unknown as WorkoutTemplate).slice(2),
    )
  })

  it('places the squat routine after jump rope when double unders were removed', () => {
    const legacy = v1Template()
    const warmup = (legacy.warmup as WarmupStepDef[]).filter((step) => step.id !== 'double-unders')
    expect(warmupIds(migrateTemplate(v1Template(warmup), 1)).slice(0, 1 + squatIds.length)).toEqual([
      'jump-rope',
      ...squatIds,
    ])
  })

  it('places the squat routine first when there is no jump rope', () => {
    const warmup = (v1Template().warmup as WarmupStepDef[]).filter(
      (step) => step.id !== 'jump-rope' && step.id !== 'double-unders',
    )
    expect(warmupIds(migrateTemplate(v1Template(warmup), 1)).slice(0, squatIds.length)).toEqual(squatIds)
  })

  it('does not add the squat routine twice', () => {
    const warmup = [...(v1Template().warmup as WarmupStepDef[]), { ...SQUAT_ROUTINE[0] }]
    const migrated = migrateTemplate(v1Template(warmup), 1)
    expect(warmupIds(migrated).filter((id) => id === SQUAT_ROUTINE[0].id)).toHaveLength(1)
    expect(warmupIds(migrated)).toHaveLength(warmup.length)
  })

  it('passes a current-version template through unchanged', () => {
    const template = createDefaultTemplate()
    expect(migrateTemplate(structuredClone(template), SCHEMA_VERSION)).toEqual(template)
  })

  it('refuses newer versions and malformed templates', () => {
    expect(() => migrateTemplate(createDefaultTemplate(), SCHEMA_VERSION + 1)).toThrow(MigrationError)
    expect(() => migrateTemplate({ id: 'default' }, 1)).toThrow(MigrationError)
    expect(() => migrateTemplate('nope', 1)).toThrow(MigrationError)
  })
})

describe('isValidSession', () => {
  it('requires runtime state on active sessions and recommendations on finished ones', () => {
    expect(isValidSession(session)).toBe(true)
    expect(isValidSession({ ...session, runtime: undefined })).toBe(false)
    expect(isValidSession({ ...session, status: 'completed' })).toBe(false)
  })

  it('accepts a workout saved without a type and rejects an unknown type', () => {
    expect(isValidSession(v1Session(session))).toBe(true)
    expect(isValidSession({ ...session, templateId: 'lower' })).toBe(true)
    expect(isValidSession({ ...session, templateId: 'legs' })).toBe(false)
  })

  it('validates the new warm-up log fields', () => {
    const withStep = (patch: Record<string, unknown>) => ({
      ...session,
      warmup: [{ ...session.warmup[0], ...patch }, ...session.warmup.slice(1)],
    })
    expect(isValidSession(withStep({ reps: 10, perSide: true, flowGroup: 'squat-routine' }))).toBe(true)
    expect(isValidSession(withStep({ reps: 0 }))).toBe(false)
    expect(isValidSession(withStep({ flowGroup: '' }))).toBe(false)
  })
})

describe('isValidTemplate', () => {
  const template = createDefaultTemplate()
  const withStep = (patch: Record<string, unknown>) => ({
    ...template,
    warmup: [...template.warmup, { id: 'extra', name: 'Extra', durationSec: 30, ...patch }],
  })

  it('accepts both workouts and nothing else', () => {
    expect(isValidTemplate({ ...template, id: 'upper' })).toBe(true)
    expect(isValidTemplate({ ...template, id: 'lower' })).toBe(true)
    expect(isValidTemplate({ ...template, id: 'default' })).toBe(false)
    expect(isValidTemplate({ ...template, id: 'legs' })).toBe(false)
  })

  it('validates rep-counted, per-side, and grouped warm-up steps', () => {
    expect(isValidTemplate(withStep({ reps: 10, perSide: true, flowGroup: 'squat-routine' }))).toBe(true)
    expect(isValidTemplate(withStep({ reps: 0 }))).toBe(false)
    expect(isValidTemplate(withStep({ reps: 1.5 }))).toBe(false)
    expect(isValidTemplate(withStep({ perSide: 'yes' }))).toBe(false)
    expect(isValidTemplate(withStep({ flowGroup: 3 }))).toBe(false)
  })

  it('accepts the hold style on a timed exercise and rejects unknown styles', () => {
    const carryIndex = template.exercises.findIndex((exercise) => exercise.kind === 'carry')
    const withStyle = (style: unknown) => ({
      ...template,
      exercises: template.exercises.map((exercise, i) => (i === carryIndex ? { ...exercise, style } : exercise)),
    })
    expect(isValidTemplate(withStyle('hold'))).toBe(true)
    expect(isValidTemplate(withStyle('swing'))).toBe(false)
  })
})
