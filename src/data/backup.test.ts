import { describe, expect, it } from 'vitest'
import { isValidSession, isValidSettings, isValidTemplate } from '../domain/migrate'
import { SHOULDER_CARS, SINGLE_LEG_HIP_THRUST } from '../domain/templateRevisions'
import { buildSession, finishSession, reopenSession, resolvePending, softDeleteSession } from '../domain/session'
import { SQUAT_ROUTINE } from '../domain/sharedWarmup'
import { DEFAULT_SETTINGS, type WorkoutSession, type WorkoutTemplate } from '../domain/types'
import { BackupError, buildBackup, parseBackup, planImport } from './backup'
import { createDefaultTemplates, createTemplate } from './seed/defaultTemplate'
import { generateDemoHistory } from './seed/demoHistory'

const T0 = Date.UTC(2026, 8, 1, 17, 0)
const HOUR = 3600_000
/** When the file is opened: a week after it was made. */
const OPENED = T0 + 7 * 24 * HOUR

function workout(id: string, startedAt: number, source: 'real' | 'demo' = 'real'): WorkoutSession {
  const session = buildSession({ id, now: startedAt, template: createTemplate('upper'), prescriptions: new Map(), source })
  return finishSession(resolvePending(session, { dips: 'done' }), { now: startedAt + HOUR })
}

const local = (sessions: WorkoutSession[] = []) => ({
  sessions,
  overrides: [],
  templates: createDefaultTemplates(),
  settings: { ...DEFAULT_SETTINGS },
})

const parse = (file: unknown) => parseBackup(JSON.stringify(file), OPENED)

describe('buildBackup and parseBackup', () => {
  it('round-trips every real record and both workouts, and leaves out active and demo sessions', () => {
    const active = buildSession({ id: 'live', now: T0, template: createTemplate('upper'), prescriptions: new Map() })
    const deleted = softDeleteSession(workout('gone', T0 - 48 * HOUR), T0)
    const source = {
      ...local([workout('a', T0), workout('demo-01', T0, 'demo'), active, deleted]),
      overrides: [
        { id: 'o1', targetId: 'db-row', prescription: { kind: 'reps' as const, loadKg: 20, reps: [5, 5, 5] }, createdAt: T0, updatedAt: T0 },
      ],
    }
    const backup = buildBackup(source, T0 + HOUR, '0.1.0')
    expect(backup.sessions.map((s) => s.id).sort()).toEqual(['a', 'gone'])
    expect(backup.counts).toEqual({ sessions: 2, overrides: 1 })
    expect(backup.templates.map((t) => t.id)).toEqual(['upper', 'lower'])

    const parsed = parse(backup)
    expect(parsed.sessions).toEqual(backup.sessions)
    expect(parsed.overrides).toEqual(backup.overrides)
    expect(parsed.templates).toEqual(backup.templates)
  })

  it('rejects malformed JSON, foreign files, truncated files, and newer schema versions', () => {
    const backup = buildBackup(local([workout('a', T0)]), T0, '0.1.0')
    expect(() => parseBackup('{not json', OPENED)).toThrow(BackupError)
    expect(() => parse({ hello: 'world' })).toThrow(/not an EG Workout Tracker backup/)
    expect(() => parse({ ...backup, counts: { sessions: 5, overrides: 0 } })).toThrow(/truncated/)
    expect(() => parse({ ...backup, schemaVersion: 99 })).toThrow(/newer version/)
  })
})

describe('schema-1 backups', () => {
  /** A backup as the first version wrote it: one template, workouts without a type. */
  function v1Backup(sessions: unknown[] = [workout('a', T0)]) {
    const { templates: _templates, ...rest } = buildBackup(local(), T0, '0.1.0')
    const template = createTemplate('upper')
    const squatIds = new Set(SQUAT_ROUTINE.map((step) => step.id))
    const untyped = sessions.map((s) => {
      const { templateId: _templateId, ...record } = structuredClone(s as WorkoutSession)
      return record
    })
    return {
      ...rest,
      schemaVersion: 1,
      counts: { sessions: untyped.length, overrides: 0 },
      sessions: untyped,
      template: { ...template, id: 'default', warmup: template.warmup.filter((s) => !squatIds.has(s.id)), updatedAt: T0 },
    }
  }

  it('restores the workouts as upper body and the template as the upper-body workout with the squat routine', () => {
    const parsed = parse(v1Backup())
    expect(parsed.sessions.map((s) => s.templateId)).toEqual(['upper'])
    expect(parsed.templates.map((t) => t.id)).toEqual(['upper'])
    expect(parsed.templates[0].warmup.map((s) => s.id)).toContain('deep-squat-hold')
    expect(parsed.templates[0].updatedAt).toBe(T0)
  })

  it('merges the restored upper template and leaves the local lower one to the shared-step sync', () => {
    const plan = planImport(parse(v1Backup()), local())
    expect(plan.templates.map((t) => t.id)).toEqual(['upper'])
  })

  it('rejects a workout record that cannot be migrated', () => {
    const file = v1Backup([{ ...workout('a', T0), exercises: [{ kind: 'reps' }] }])
    expect(() => parse(file)).toThrow(/workout record is malformed/)
  })
})

describe('backup validation', () => {
  const valid = () => buildBackup(local([workout('a', T0)]), T0 + HOUR, '0.1.0')
  const reject = (mutate: (file: Record<string, unknown>) => void, message: RegExp) => {
    const file = JSON.parse(JSON.stringify(valid())) as Record<string, unknown>
    mutate(file)
    expect(() => parse(file)).toThrow(BackupError)
    expect(() => parse(file)).toThrow(message)
  }
  const firstSession = (file: Record<string, unknown>) => (file.sessions as Record<string, unknown>[])[0]
  const firstTemplate = (file: Record<string, unknown>) => (file.templates as Record<string, unknown>[])[0]

  it('accepts everything the app itself writes', () => {
    const templates = createDefaultTemplates()
    const demo = generateDemoHistory({ now: T0, templates })
    const active = buildSession({ id: 'live', now: T0, template: templates.lower, prescriptions: new Map() })
    const reopened = reopenSession(workout('b', T0), T0 + 2 * HOUR)
    for (const session of [...demo, active, reopened, workout('a', T0)]) expect(isValidSession(session)).toBe(true)
    expect(isValidTemplate(templates.upper)).toBe(true)
    expect(isValidTemplate(templates.lower)).toBe(true)
    expect(isValidSettings(DEFAULT_SETTINGS)).toBe(true)
    expect(() => parse(buildBackup(local([workout('a', T0), reopened]), T0, '0.1.0'))).not.toThrow()
  })

  it('rejects a template whose exercises or warm-up steps are incomplete', () => {
    reject((file) => {
      delete (firstTemplate(file).exercises as Record<string, unknown>[])[0].baseline
    }, /workout template is malformed/)
    reject((file) => {
      ;(firstTemplate(file).exercises as Record<string, unknown>[])[0].scheme = {
        type: 'staircase',
        sets: 3,
        minReps: 6,
        maxReps: 5,
      }
    }, /workout template is malformed/)
    reject((file) => {
      ;(firstTemplate(file).warmup as unknown[]).push(null)
    }, /workout template is malformed/)
  })

  it('rejects unknown, missing, or repeated workouts', () => {
    reject((file) => {
      firstTemplate(file).id = 'legs'
    }, /workout template is malformed/)
    reject((file) => {
      file.templates = []
    }, /no workout template/)
    reject((file) => {
      const templates = file.templates as unknown[]
      templates[1] = structuredClone(templates[0])
    }, /same workout twice/)
  })

  it('rejects settings with unknown values', () => {
    reject((file) => {
      ;(file.settings as Record<string, unknown>).theme = 'neon'
    }, /malformed settings/)
  })

  it('rejects workouts with malformed sets, recommendations, or an active slot', () => {
    reject((file) => {
      const exercises = firstSession(file).exercises as Record<string, unknown>[]
      exercises[0].actual = [{ reps: 5 }]
    }, /workout record is malformed/)
    reject((file) => {
      const recommendations = firstSession(file).recommendations as Record<string, { prescription: unknown }>
      recommendations['pull-ups'].prescription = { kind: 'reps', loadKg: 0 }
    }, /workout record is malformed/)
    reject((file) => {
      firstSession(file).activeSlot = 'active'
    }, /workout record is malformed/)
  })

  it('rejects a manual target without a usable prescription', () => {
    reject((file) => {
      file.overrides = [{ id: 'o1', targetId: 'db-row', prescription: { kind: 'reps', reps: [] }, createdAt: T0, updatedAt: T0 }]
      ;(file.counts as Record<string, number>).overrides = 1
    }, /manual target record is malformed/)
  })

  it('refuses dates that would outrank every later workout, and dates before 1970', () => {
    reject((file) => {
      firstSession(file).finishedAt = OPENED + 2 * 24 * HOUR
    }, /dates in the future/)
    reject((file) => {
      file.overrides = [
        {
          id: 'o1',
          targetId: 'db-row',
          prescription: { kind: 'reps', loadKg: 20, reps: [5, 5, 5] },
          createdAt: OPENED + 30 * 24 * HOUR,
          updatedAt: OPENED + 30 * 24 * HOUR,
        },
      ]
      ;(file.counts as Record<string, number>).overrides = 1
    }, /dates in the future/)
    reject((file) => {
      firstTemplate(file).updatedAt = -1
    }, /before 1970/)
    // A few hours of clock difference between devices is fine.
    const skewed = JSON.parse(JSON.stringify(valid())) as Record<string, unknown>
    firstSession(skewed).updatedAt = OPENED + 3 * HOUR
    expect(() => parse(skewed)).not.toThrow()
  })

  it('backs up a reopened workout as it was when finished', () => {
    const finished = workout('b', T0)
    const reopened = reopenSession(finished, T0 + 2 * HOUR)
    const backup = buildBackup(local([reopened]), T0 + 3 * HOUR, '0.1.0')
    expect(backup.sessions).toHaveLength(1)
    expect(backup.sessions[0]).toMatchObject({ id: 'b', status: 'completed', finishedAt: finished.finishedAt })
    expect(backup.sessions[0]).not.toHaveProperty('activeSlot')
    expect(backup.sessions[0]).not.toHaveProperty('runtime')
  })
})

describe('planImport', () => {
  it('adds new workouts and previews counts and dates', () => {
    const backup = buildBackup(local([workout('a', T0), workout('b', T0 + 24 * HOUR)]), T0, '0.1.0')
    const plan = planImport(backup, local())
    expect(plan.sessionsToPut.map((s) => s.id)).toEqual(['a', 'b'])
    expect(plan.preview).toMatchObject({ workouts: 2, newWorkouts: 2, firstWorkoutAt: T0, lastWorkoutAt: T0 + 24 * HOUR })
  })

  it('updates an older local copy but keeps a newer one', () => {
    const older = workout('a', T0)
    const newer = { ...older, updatedAt: older.updatedAt + 1000, rev: older.rev + 1 }

    const fromNewer = planImport(buildBackup(local([newer]), T0, '0.1.0'), local([older]))
    expect(fromNewer.sessionsToPut.map((s) => s.id)).toEqual(['a'])

    const fromOlder = planImport(buildBackup(local([older]), T0, '0.1.0'), local([newer]))
    expect(fromOlder.sessionsToPut).toEqual([])
  })

  it('never resurrects a workout deleted locally after the backup was made', () => {
    const original = workout('a', T0)
    const deletedLocally = softDeleteSession(original, original.updatedAt + 5000)
    const plan = planImport(buildBackup(local([original]), T0, '0.1.0'), local([deletedLocally]))
    expect(plan.sessionsToPut).toEqual([])
  })

  it('keeps the local copy and reports a conflict when planned values differ', () => {
    const mine = workout('a', T0)
    const theirs = structuredClone({ ...mine, updatedAt: mine.updatedAt + 1000 })
    const row = theirs.exercises[2]
    if (row.kind === 'reps') row.planned.loadKg = 30
    const plan = planImport(buildBackup(local([theirs]), T0, '0.1.0'), local([mine]))
    expect(plan.sessionsToPut).toEqual([])
    expect(plan.conflicts).toEqual(['a'])
  })

  it('imports finished records without fields only an active workout carries', () => {
    const incoming = { ...workout('a', T0), runtime: { phase: 'strength' }, reopenSnapshot: workout('a', T0) } as WorkoutSession
    const plan = planImport({ ...buildBackup(local([]), T0, '0.1.0'), sessions: [incoming] }, local())
    expect(plan.sessionsToPut).toHaveLength(1)
    expect(plan.sessionsToPut[0]).not.toHaveProperty('runtime')
    expect(plan.sessionsToPut[0]).not.toHaveProperty('reopenSnapshot')
    expect(plan.sessionsToPut[0]).not.toHaveProperty('activeSlot')
  })

  it('skips demo sessions and never touches the local active workout', () => {
    const backup = buildBackup(local([workout('a', T0)]), T0, '0.1.0')
    backup.sessions.push(workout('demo-01', T0, 'demo'))
    backup.counts.sessions = backup.sessions.length
    const activeLocal = buildSession({ id: 'a', now: T0, template: createTemplate('upper'), prescriptions: new Map() })
    const plan = planImport(backup, local([activeLocal]))
    expect(plan.sessionsToPut).toEqual([])
    expect(plan.preview.skippedWorkouts).toBe(2)
  })

  it('restores an upper-body warm-up backed up before the shoulder steps went per side with them split', () => {
    const seed = createTemplate('upper')
    const bothArms = { id: 'shoulder-cars', name: 'Shoulder CARs', durationSec: 45, cue: 'Slow, controlled circles — both arms' }
    const upper: WorkoutTemplate = {
      ...seed,
      warmup: seed.warmup.map((step) => (step.id === bothArms.id ? bothArms : step)),
      updatedAt: T0,
    }
    const source = { ...local(), templates: { ...createDefaultTemplates(), upper } }
    const restored = planImport(parse(buildBackup(source, T0, '0.2.0')), local()).templates
    expect(restored.map((t) => t.id)).toEqual(['upper'])
    expect(restored[0].warmup.find((step) => step.id === bothArms.id)).toEqual(SHOULDER_CARS)
  })

  it('restores a lower-body workout backed up with the two-leg hip thrust with the single-leg one in its place', () => {
    const seed = createTemplate('lower')
    const twoLeg = { ...SINGLE_LEG_HIP_THRUST, id: 'hip-thrust', name: 'Hip thrust', shortName: 'Hip thrust', perSide: false }
    const lower: WorkoutTemplate = {
      ...seed,
      exercises: seed.exercises.map((e) => (e.id === SINGLE_LEG_HIP_THRUST.id ? twoLeg : e)),
      updatedAt: T0,
    }
    const source = { ...local(), templates: { ...createDefaultTemplates(), lower } }
    const restored = planImport(parse(buildBackup(source, T0, '0.2.0')), local()).templates
    expect(restored.map((t) => t.id)).toEqual(['lower'])
    expect(restored[0].exercises.map((e) => e.id)).toEqual(seed.exercises.map((e) => e.id))
    expect(restored[0].updatedAt).toBe(T0)
  })

  it('restores each workout edited after the seed but keeps a newer local copy of it', () => {
    const editedLower: WorkoutTemplate = { ...createTemplate('lower'), updatedAt: T0 }
    const source = { ...local(), templates: { ...createDefaultTemplates(), lower: editedLower } }
    expect(planImport(buildBackup(source, T0, '0.1.0'), local()).templates).toEqual([editedLower])

    const newerLocal = { ...local(), templates: { ...createDefaultTemplates(), lower: { ...editedLower, updatedAt: T0 + 1 } } }
    expect(planImport(buildBackup(source, T0, '0.1.0'), newerLocal).templates).toEqual([])

    // A tie keeps the local copy.
    const sameAge = { ...local(), templates: { ...createDefaultTemplates(), lower: { ...editedLower } } }
    expect(planImport(buildBackup(source, T0, '0.1.0'), sameAge).templates).toEqual([])
  })
})
