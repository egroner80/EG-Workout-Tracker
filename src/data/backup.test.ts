import { describe, expect, it } from 'vitest'
import { isValidSession, isValidSettings, isValidTemplate } from '../domain/migrate'
import { buildSession, finishSession, reopenSession, resolvePending, softDeleteSession } from '../domain/session'
import { DEFAULT_SETTINGS, type WorkoutSession } from '../domain/types'
import { BackupError, buildBackup, parseBackup, planImport } from './backup'
import { createDefaultTemplate } from './seed/defaultTemplate'
import { generateDemoHistory } from './seed/demoHistory'

const T0 = Date.UTC(2026, 8, 1, 17, 0)
const HOUR = 3600_000

function workout(id: string, startedAt: number, source: 'real' | 'demo' = 'real'): WorkoutSession {
  const session = buildSession({ id, now: startedAt, template: createDefaultTemplate(), prescriptions: new Map(), source })
  return finishSession(resolvePending(session, { dips: 'done' }), { now: startedAt + HOUR })
}

const local = (sessions: WorkoutSession[] = []) => ({
  sessions,
  overrides: [],
  template: createDefaultTemplate(),
  settings: { ...DEFAULT_SETTINGS },
})

describe('buildBackup and parseBackup', () => {
  it('round-trips every real record and leaves out active and demo sessions', () => {
    const active = buildSession({ id: 'live', now: T0, template: createDefaultTemplate(), prescriptions: new Map() })
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

    const parsed = parseBackup(JSON.stringify(backup))
    expect(parsed.sessions).toEqual(backup.sessions)
    expect(parsed.overrides).toEqual(backup.overrides)
    expect(parsed.template).toEqual(backup.template)
  })

  it('rejects malformed JSON, foreign files, truncated files, and newer schema versions', () => {
    const backup = buildBackup(local([workout('a', T0)]), T0, '0.1.0')
    expect(() => parseBackup('{not json')).toThrow(BackupError)
    expect(() => parseBackup(JSON.stringify({ hello: 'world' }))).toThrow(/not an Overload backup/)
    expect(() => parseBackup(JSON.stringify({ ...backup, counts: { sessions: 5, overrides: 0 } }))).toThrow(/truncated/)
    expect(() => parseBackup(JSON.stringify({ ...backup, schemaVersion: 99 }))).toThrow(/newer version/)
  })
})

describe('backup validation', () => {
  const valid = () => buildBackup(local([workout('a', T0)]), T0 + HOUR, '0.1.0')
  const reject = (mutate: (file: Record<string, unknown>) => void, message: RegExp) => {
    const file = JSON.parse(JSON.stringify(valid())) as Record<string, unknown>
    mutate(file)
    expect(() => parseBackup(JSON.stringify(file))).toThrow(BackupError)
    expect(() => parseBackup(JSON.stringify(file))).toThrow(message)
  }
  const firstSession = (file: Record<string, unknown>) => (file.sessions as Record<string, unknown>[])[0]

  it('accepts everything the app itself writes', () => {
    const template = createDefaultTemplate()
    const demo = generateDemoHistory({ now: T0, template })
    const active = buildSession({ id: 'live', now: T0, template, prescriptions: new Map() })
    const reopened = reopenSession(workout('b', T0), T0 + 2 * HOUR)
    for (const session of [...demo, active, reopened, workout('a', T0)]) expect(isValidSession(session)).toBe(true)
    expect(isValidTemplate(template)).toBe(true)
    expect(isValidSettings(DEFAULT_SETTINGS)).toBe(true)
    expect(() => parseBackup(JSON.stringify(buildBackup(local([workout('a', T0), reopened]), T0, '0.1.0')))).not.toThrow()
  })

  it('rejects a template whose exercises or warm-up steps are incomplete', () => {
    reject((file) => {
      const exercises = (file.template as { exercises: Record<string, unknown>[] }).exercises
      delete exercises[0].baseline
    }, /malformed template or settings/)
    reject((file) => {
      const exercises = (file.template as { exercises: Record<string, unknown>[] }).exercises
      exercises[0].scheme = { type: 'staircase', sets: 3, minReps: 6, maxReps: 5 }
    }, /malformed template or settings/)
    reject((file) => {
      ;(file.template as { warmup: unknown[] }).warmup.push(null)
    }, /malformed template or settings/)
  })

  it('rejects settings with unknown values', () => {
    reject((file) => {
      ;(file.settings as Record<string, unknown>).theme = 'neon'
    }, /malformed template or settings/)
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
    const activeLocal = buildSession({ id: 'a', now: T0, template: createDefaultTemplate(), prescriptions: new Map() })
    const plan = planImport(backup, local([activeLocal]))
    expect(plan.sessionsToPut).toEqual([])
    expect(plan.preview.skippedWorkouts).toBe(2)
  })

  it('restores a template edited after the seed but keeps a newer local template', () => {
    const edited = { ...createDefaultTemplate(), updatedAt: T0 }
    const plan = planImport(buildBackup({ ...local(), template: edited }, T0, '0.1.0'), local())
    expect(plan.template).toEqual(edited)

    const newerLocal = { ...local(), template: { ...createDefaultTemplate(), updatedAt: T0 + 1 } }
    expect(planImport(buildBackup({ ...local(), template: edited }, T0, '0.1.0'), newerLocal).template).toBeUndefined()
  })
})
