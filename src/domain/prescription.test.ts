import { describe, expect, it } from 'vitest'
import { createTemplate } from '../data/seed/defaultTemplate'
import { deriveCurrentPrescriptions, findLastTime } from './prescription'
import { buildSession, finishSession, resolvePending } from './session'
import type { Prescription, PrescriptionOverride, WorkoutSession, WorkoutTemplate } from './types'

const HOUR = 60 * 60 * 1000
const T0 = Date.UTC(2026, 8, 1, 17, 0)

function finished(
  id: string,
  startedAt: number,
  opts: {
    template?: WorkoutTemplate
    prescriptions?: ReadonlyMap<string, Prescription>
    source?: 'real' | 'demo'
    skip?: string[]
  } = {},
): WorkoutSession {
  const template = opts.template ?? createTemplate('upper')
  const session = buildSession({
    id,
    now: startedAt,
    template,
    prescriptions: opts.prescriptions ?? new Map(),
    source: opts.source,
  })
  const resolutions = Object.fromEntries(
    session.exercises.map((e) => [e.exerciseId, opts.skip?.includes(e.exerciseId) ? ('skipped' as const) : ('done' as const)]),
  )
  return finishSession(resolvePending(session, resolutions), { now: startedAt + HOUR })
}

function override(targetId: string, createdAt: number, loadKg = 14): PrescriptionOverride {
  return {
    id: `o-${targetId}-${createdAt}`,
    targetId,
    prescription: { kind: 'reps', loadKg, reps: [5, 5, 5] },
    createdAt,
    updatedAt: createdAt,
  }
}

const derive = (sessions: WorkoutSession[], overrides: PrescriptionOverride[] = [], template = createTemplate('upper')) =>
  deriveCurrentPrescriptions({ template, sessions, overrides })

describe('deriveCurrentPrescriptions', () => {
  it('uses the seeded baseline when there is no history', () => {
    const row = derive([]).get('db-row')
    expect(row).toMatchObject({ source: 'baseline', prescription: { kind: 'reps', loadKg: 18, reps: [4, 4, 4] } })
    expect(derive([]).get('jump-rope')?.prescription).toEqual({ kind: 'warmup', durationSec: 120, active: true })
    expect(derive([]).get('double-unders')?.prescription).toEqual({ kind: 'warmup', durationSec: 30, active: false })
  })

  it("uses the latest finished session's recommendations", () => {
    const s1 = finished('s1', T0)
    const row = derive([s1]).get('db-row')
    expect(row).toMatchObject({ source: 'recommendation', sessionId: 's1', prescription: { loadKg: 18, reps: [5, 4, 4] } })
  })

  it('applies an override created after the latest session and yields to a newer session', () => {
    const s1 = finished('s1', T0)
    const o = override('db-row', T0 + 2 * HOUR)
    expect(derive([s1], [o]).get('db-row')).toMatchObject({ source: 'override', prescription: { loadKg: 14 } })

    const s2 = finished('s2', T0 + 24 * HOUR)
    expect(derive([s1, s2], [o]).get('db-row')).toMatchObject({ source: 'recommendation', sessionId: 's2' })
  })

  it('ignores an override older than the latest session', () => {
    const s1 = finished('s1', T0)
    const early = override('db-row', T0 - HOUR)
    expect(derive([s1], [early]).get('db-row')?.source).toBe('recommendation')
  })

  it('applies an override before any real session exists (fresh install with demo data)', () => {
    const demo = finished('demo-01', T0 - 48 * HOUR, { source: 'demo' })
    const edit = override('db-bench', T0, 14)
    expect(derive([demo], [edit]).get('db-bench')).toMatchObject({ source: 'override', prescription: { loadKg: 14 } })
  })

  it("applies a newly added exercise's override before its first workout", () => {
    const template = createTemplate('upper')
    const bench = template.exercises[3]
    if (bench.kind !== 'reps') throw new Error('expected a reps exercise')
    template.exercises.push({
      ...bench,
      id: 'face-pulls',
      name: 'Face pulls',
      shortName: 'Face pulls',
      scheme: { type: 'staircase', sets: 3, minReps: 10, maxReps: 12 },
      baseline: { kind: 'reps', loadKg: 20, reps: [10, 10, 10] },
    })
    const s1 = finished('s1', T0)
    const edit: PrescriptionOverride = {
      id: 'o1',
      targetId: 'face-pulls',
      prescription: { kind: 'reps', loadKg: 18, reps: [10, 10, 10] },
      createdAt: T0 - 10 * HOUR,
      updatedAt: T0 - 10 * HOUR,
    }
    expect(derive([s1], [edit], template).get('face-pulls')).toMatchObject({ source: 'override', prescription: { loadKg: 18 } })
  })

  it('keeps an override in force after the session it followed is deleted', () => {
    const s1 = finished('s1', T0)
    const s2 = finished('s2', T0 + 24 * HOUR)
    const o = override('db-row', T0 + 26 * HOUR)
    const deleted = { ...s2, deletedAt: T0 + 30 * HOUR }
    expect(derive([s1, deleted], [o]).get('db-row')).toMatchObject({ source: 'override', sessionId: 's1' })
  })

  it('falls back to the previous session when the newest is deleted, discarded, or demo', () => {
    const s1 = finished('s1', T0)
    const s2 = finished('s2', T0 + 24 * HOUR)
    expect(derive([s1, { ...s2, deletedAt: T0 + 30 * HOUR }]).get('db-row')?.sessionId).toBe('s1')
    expect(derive([s1, { ...s2, status: 'discarded' }]).get('db-row')?.sessionId).toBe('s1')
    expect(derive([s1, { ...s2, source: 'demo' }]).get('db-row')?.sessionId).toBe('s1')
  })

  it('uses the newest session that has the exercise when the latest lacks it', () => {
    const s1 = finished('s1', T0)
    const s2 = { ...finished('s2', T0 + 24 * HOUR), recommendations: {} }
    expect(derive([s1, s2]).get('db-row')?.sessionId).toBe('s1')
  })

  it('restarts at the bottom rung when the set count changes', () => {
    const s1 = finished('s1', T0)
    const template = createTemplate('upper')
    const pullUps = template.exercises[0]
    if (pullUps.kind === 'reps') pullUps.scheme = { ...pullUps.scheme, sets: 4 }
    expect(derive([s1], [], template).get('pull-ups')?.prescription).toEqual({ kind: 'reps', loadKg: 0, reps: [5, 5, 5, 5] })
  })

  it("judges the last workout by today's rules from what was actually done, whatever it stored", () => {
    // Pull-ups planned 5/5/6 and done 6/6/5, stored as a repeat by a version that compared set by set.
    const s1 = finished('s1', T0, { prescriptions: new Map<string, Prescription>([['pull-ups', { kind: 'reps', loadKg: 0, reps: [5, 5, 6] }]]) })
    const stale: WorkoutSession = {
      ...s1,
      exercises: s1.exercises.map((e) =>
        e.kind === 'reps' && e.exerciseId === 'pull-ups' ? { ...e, actual: e.actual.map((set, i) => ({ ...set, reps: [6, 6, 5][i] })) } : e,
      ),
      recommendations: {
        ...s1.recommendations,
        'pull-ups': { targetId: 'pull-ups', outcome: 'repeat', prescription: { kind: 'reps', loadKg: 0, reps: [5, 5, 6] } },
      },
    }
    expect(derive([stale]).get('pull-ups')).toMatchObject({
      source: 'recommendation',
      prescription: { kind: 'reps', loadKg: 0, reps: [6, 6, 6] },
      recommendation: { outcome: 'advance' },
    })
    // A progressive warm-up step keeps the recommendation it stored.
    expect(derive([stale]).get('jump-rope')?.prescription).toEqual(s1.recommendations?.['jump-rope']?.prescription)
  })

  it('keeps the target when the rep range changes, even below the new minimum', () => {
    const s1 = finished('s1', T0, { prescriptions: new Map<string, Prescription>([['db-row', { kind: 'reps', loadKg: 18, reps: [5, 6, 5] }]]) })
    const template = createTemplate('upper')
    const row = template.exercises[2]
    if (row.kind === 'reps') row.scheme = { ...row.scheme, minReps: 8, maxReps: 12 }
    expect(derive([s1], [], template).get('db-row')?.prescription).toEqual({ kind: 'reps', loadKg: 18, reps: [6, 6, 5] })
  })
})

describe('findLastTime', () => {
  it('returns the newest earlier real session with a done set, skipping fully skipped ones', () => {
    const s1 = finished('s1', T0)
    const s2 = finished('s2', T0 + 24 * HOUR, { skip: ['dips'] })
    expect(findLastTime('db-row', [s1, s2])?.session.id).toBe('s2')
    expect(findLastTime('dips', [s1, s2])?.session.id).toBe('s1')
  })

  it('ignores demo sessions and sessions starting at or after the cutoff', () => {
    const s1 = finished('s1', T0)
    const demo = finished('demo-01', T0 + 24 * HOUR, { source: 'demo' })
    expect(findLastTime('db-row', [s1, demo])?.session.id).toBe('s1')
    expect(findLastTime('db-row', [s1], T0)).toBeUndefined()
  })
})
