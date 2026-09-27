import { describe, expect, it } from 'vitest'
import { buildSession, finishSession, resolvePending, softDeleteSession } from '../domain/session'
import { DEFAULT_SETTINGS, type WorkoutSession } from '../domain/types'
import { BackupError, buildBackup, parseBackup, planImport } from './backup'
import { createDefaultTemplate } from './seed/defaultTemplate'

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
