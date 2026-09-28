import { describe, expect, it } from 'vitest'
import { createTemplate } from '../data/seed/defaultTemplate'
import { exerciseRows, increaseDates, ladderGroups, loadSeries, volumeSeries, warmupSeries } from './history'
import { buildSession, finishSession, resolvePending } from './session'
import type { Prescription, RepsExerciseLog, WorkoutSession } from './types'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 6, 1, 17, 0)

/** A finished workout with a planned DB row target; `short` makes the last set one rep short. */
function rowWorkout(day: number, loadKg: number, reps: number[], opts: { short?: boolean; skipSet?: number } = {}) {
  const template = createTemplate('upper')
  const prescriptions = new Map<string, Prescription>([['db-row', { kind: 'reps', loadKg, reps }]])
  let session = buildSession({ id: `w${day}`, now: T0 + day * DAY, template, prescriptions })
  session = resolvePending(session, { 'db-row': 'done' })
  session = {
    ...session,
    exercises: session.exercises.map((e) => {
      if (e.exerciseId !== 'db-row' || e.kind !== 'reps') return e
      const actual = e.actual.map((set, i) => {
        if (opts.skipSet === i) return { ...set, status: 'skipped' as const }
        if (opts.short && i === e.actual.length - 1) return { ...set, reps: set.reps - 1 }
        return set
      })
      return { ...e, actual }
    }),
  }
  return finishSession(session, { now: T0 + day * DAY + 3_000_000 })
}

const row = (s: WorkoutSession) => s.exercises.find((e) => e.exerciseId === 'db-row') as RepsExerciseLog

describe('ladderGroups', () => {
  it('groups rungs by load with attempt counts and marks the increase', () => {
    const sessions = [
      rowWorkout(0, 18, [5, 5, 5]),
      rowWorkout(3, 18, [5, 5, 6]),
      rowWorkout(6, 18, [5, 6, 6], { short: true }),
      rowWorkout(9, 18, [5, 6, 6]),
      rowWorkout(12, 18, [6, 6, 6]),
      rowWorkout(15, 20, [5, 5, 5]),
    ]
    const groups = ladderGroups('db-row', sessions)
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({ loadKg: 18, increased: false })
    expect(groups[0].rungs.map((r) => [r.label, r.attempts, r.completed])).toEqual([
      ['5/5/5', 1, true],
      ['5/5/6', 1, true],
      ['5/6/6', 2, true],
      ['6/6/6', 1, true],
    ])
    expect(groups[1]).toMatchObject({ loadKg: 20, increased: true, startDate: T0 + 15 * DAY })
  })
})

describe('exerciseRows', () => {
  it('lists date, target, actual, and success newest first', () => {
    const rows = exerciseRows('db-row', [rowWorkout(0, 18, [5, 5, 5]), rowWorkout(3, 18, [5, 5, 6], { short: true })])
    expect(rows.map((r) => [r.target, r.actual, r.met])).toEqual([
      ['18 kg · 5 / 5 / 6', '18 kg · 5 / 5 / 5', false],
      ['18 kg · 5 / 5 / 5', '18 kg · 5 / 5 / 5', true],
    ])
  })

  it('ignores deleted and discarded workouts', () => {
    const deleted = { ...rowWorkout(0, 18, [5, 5, 5]), deletedAt: T0 }
    expect(exerciseRows('db-row', [deleted])).toEqual([])
  })
})

describe('series', () => {
  it('uses the lowest done load and excludes skipped sets from rep totals', () => {
    const skipped = rowWorkout(0, 18, [5, 5, 5], { skipSet: 1 })
    expect(volumeSeries('db-row', [skipped])[0].value).toBe(10)
    const mixed = rowWorkout(3, 18, [5, 5, 5])
    row(mixed).actual[2].loadKg = 16
    expect(loadSeries('db-row', [mixed])[0].value).toBe(16)
  })

  it('finds the dates the load increased', () => {
    const points = loadSeries('db-row', [rowWorkout(0, 18, [6, 6, 6]), rowWorkout(3, 20, [5, 5, 5]), rowWorkout(6, 20, [5, 5, 6])])
    expect(increaseDates(points)).toEqual([T0 + 3 * DAY])
  })

  it('tracks jump rope duration and is empty without history', () => {
    expect(warmupSeries('jump-rope', [rowWorkout(0, 18, [5, 5, 5])])[0].value).toBe(120)
    expect(loadSeries('db-row', [])).toEqual([])
  })
})
