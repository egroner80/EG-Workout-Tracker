import { describe, expect, it } from 'vitest'
import { createTemplate } from '../data/seed/defaultTemplate'
import {
  SessionStateError,
  buildSession,
  cancelEdits,
  discardSession,
  finishSession,
  isLogged,
  isStale,
  pendingExercises,
  plannedFingerprint,
  reopenSession,
  resolvePending,
  STALE_AFTER_MS,
} from './session'
import { SQUAT_ROUTINE } from './sharedWarmup'
import type { Prescription, WorkoutSession } from './types'

const NOW = Date.UTC(2026, 8, 27, 17, 0)

function newSession(prescriptions: ReadonlyMap<string, Prescription> = new Map()): WorkoutSession {
  return buildSession({ id: 's1', now: NOW, template: createTemplate('upper'), prescriptions })
}

function markAllDone(session: WorkoutSession): WorkoutSession {
  return resolvePending(session, Object.fromEntries(session.exercises.map((e) => [e.exerciseId, 'done' as const])))
}

describe('buildSession', () => {
  it('snapshots the template in order with actual values equal to planned and pending', () => {
    const session = newSession()
    expect(session.exercises.map((e) => e.exerciseId)).toEqual([
      'pull-ups',
      'dips',
      'db-row',
      'db-bench',
      'db-press',
      'hammer-curls',
      'reverse-crunch',
      'suitcase-carry',
    ])
    const row = session.exercises[2]
    expect(row.kind).toBe('reps')
    if (row.kind !== 'reps') return
    expect(row.planned).toEqual({ loadKg: 18, sets: [{ reps: 4 }, { reps: 4 }, { reps: 4 }] })
    expect(row.actual).toEqual([
      { reps: 4, loadKg: 18, status: 'pending' },
      { reps: 4, loadKg: 18, status: 'pending' },
      { reps: 4, loadKg: 18, status: 'pending' },
    ])
    expect(session).toMatchObject({ status: 'active', source: 'real', activeSlot: 'active', rev: 1 })
    expect(session.runtime).toMatchObject({ phase: 'warmup', currentExerciseId: 'pull-ups' })
  })

  it('includes double unders only when active', () => {
    const session = newSession()
    const du = session.warmup.find((s) => s.stepId === 'double-unders')
    expect(du?.active).toBe(false)
    expect(session.warmup.filter((s) => s.active).map((s) => s.stepId)).toEqual([
      'jump-rope',
      ...SQUAT_ROUTINE.map((step) => step.id),
      'shoulder-cars',
      'thoracic-rotations',
      'scapular-pull-ups',
      'easy-push-ups',
    ])

    const unlocked = buildSession({
      id: 's2',
      now: NOW,
      template: createTemplate('upper'),
      prescriptions: new Map<string, Prescription>([['double-unders', { kind: 'warmup', durationSec: 30, active: true }]]),
    })
    expect(unlocked.warmup.find((s) => s.stepId === 'double-unders')?.active).toBe(true)
  })

  it('plans the carry as four timed efforts, left then right per set', () => {
    const carry = newSession().exercises.at(-1)
    expect(carry?.kind).toBe('carry')
    if (carry?.kind !== 'carry') return
    expect(carry.planned.efforts.map((e) => `${e.side}${e.setIndex}`)).toEqual(['L0', 'R0', 'L1', 'R1'])
    expect(carry.planned).toMatchObject({ loadKg: 18, seconds: 40 })
  })

  it('keeps planned values untouched when actual values change', () => {
    const session = newSession()
    const before = plannedFingerprint(session)
    const row = session.exercises[2]
    if (row.kind !== 'reps') throw new Error('expected reps')
    row.actual[0] = { reps: 3, loadKg: 16, status: 'done' }
    expect(plannedFingerprint(session)).toBe(before)
    expect(row.planned.sets[0].reps).toBe(4)
  })
})

describe('pending sets and logging', () => {
  it('lists exercises with pending sets and resolves them per exercise', () => {
    const session = newSession()
    expect(pendingExercises(session)).toHaveLength(8)
    const resolved = resolvePending(session, { 'pull-ups': 'done', dips: 'skipped' })
    const [pullUps, dips] = resolved.exercises
    expect(pullUps.actual.every((s) => s.status === 'done')).toBe(true)
    expect(dips.actual.every((s) => s.status === 'skipped')).toBe(true)
    expect(pendingExercises(resolved)).toHaveLength(6)
  })

  it('counts a workout as logged once any warm-up time or set is recorded', () => {
    const session = newSession()
    expect(isLogged(session)).toBe(false)
    expect(isLogged({ ...session, warmup: [{ ...session.warmup[0], elapsedMs: 5000 }, ...session.warmup.slice(1)] })).toBe(true)
    expect(isLogged(resolvePending(session, { dips: 'done' }))).toBe(true)
  })

  it('treats a workout untouched for over four hours as stale', () => {
    const session = newSession()
    expect(isStale(session, NOW + STALE_AFTER_MS - 1)).toBe(false)
    expect(isStale(session, NOW + STALE_AFTER_MS + 1)).toBe(true)
  })
})

describe('finish, reopen, cancel, discard', () => {
  it('stores recommendations for every exercise and progressive warm-up step', () => {
    const finished = finishSession(markAllDone(newSession()), { now: NOW + 45 * 60_000 })
    expect(finished).toMatchObject({ status: 'completed', finishedAt: NOW + 45 * 60_000, rev: 2 })
    expect(finished.activeSlot).toBeUndefined()
    expect(finished.runtime).toBeUndefined()
    expect(Object.keys(finished.recommendations ?? {}).sort()).toEqual(
      [
        'db-bench',
        'db-press',
        'db-row',
        'dips',
        'double-unders',
        'hammer-curls',
        'jump-rope',
        'pull-ups',
        'reverse-crunch',
        'suitcase-carry',
      ].sort(),
    )
    expect(finished.recommendations?.['db-row'].prescription).toEqual({ kind: 'reps', loadKg: 18, reps: [5, 4, 4] })
  })

  it('refuses to finish a workout that is not active', () => {
    const finished = finishSession(markAllDone(newSession()), { now: NOW + 1 })
    expect(() => finishSession(finished, { now: NOW + 2 })).toThrow(SessionStateError)
  })

  it('stamps the last interaction time when finishing a stale workout', () => {
    const session = { ...newSession(), lastInteractionAt: NOW + 30 * 60_000 }
    const finished = finishSession(session, { now: NOW + 9 * 60 * 60_000, stale: true })
    expect(finished.finishedAt).toBe(NOW + 30 * 60_000)
  })

  it('reopens a finished workout and cancel edits restores it exactly', () => {
    const finished = finishSession(markAllDone(newSession()), { now: NOW + 45 * 60_000 })
    const reopened = reopenSession(finished, NOW + 50 * 60_000)
    expect(reopened).toMatchObject({ status: 'active', activeSlot: 'active', rev: finished.rev + 1 })
    expect(reopened.runtime?.currentExerciseId).toBe('suitcase-carry')

    const restored = cancelEdits(reopened, NOW + 55 * 60_000)
    const { rev: _rev, updatedAt: _updatedAt, ...restoredRest } = restored
    const { rev: _rev2, updatedAt: _updatedAt2, ...finishedRest } = finished
    expect(restoredRest).toEqual(finishedRest)
    expect(restored.rev).toBe(reopened.rev + 1)
  })

  it('keeps the original finish time when a reopened workout is finished again', () => {
    const finished = finishSession(markAllDone(newSession()), { now: NOW + 45 * 60_000 })
    const refinished = finishSession(reopenSession(finished, NOW + 50 * 60_000), { now: NOW + 60 * 60_000 })
    expect(refinished.finishedAt).toBe(NOW + 45 * 60_000)
    expect(refinished.reopenSnapshot).toBeUndefined()
  })

  it('discards an active workout but never a reopened one', () => {
    const discarded = discardSession(newSession(), NOW + 1)
    expect(discarded).toMatchObject({ status: 'discarded' })
    expect(discarded.activeSlot).toBeUndefined()

    const reopened = reopenSession(finishSession(markAllDone(newSession()), { now: NOW + 1 }), NOW + 2)
    expect(() => discardSession(reopened, NOW + 3)).toThrow(SessionStateError)
  })
})
