import { describe, expect, it } from 'vitest'
import { carryLog, repsLog } from '../testing'
import { evaluateExercise } from './evaluate'

describe('evaluateExercise — 5–6 ladder', () => {
  it('advances one rung when every planned set is met', () => {
    const rec = evaluateExercise(repsLog({ plannedLoad: 18, plannedReps: [5, 6, 6] }))
    expect(rec).toMatchObject({
      targetId: 'db-row',
      outcome: 'advance',
      prescription: { kind: 'reps', loadKg: 18, reps: [6, 6, 6] },
    })
  })

  it('repeats the target when one set falls short', () => {
    const rec = evaluateExercise(repsLog({ plannedLoad: 18, plannedReps: [5, 6, 6], actualReps: [5, 6, 5] }))
    expect(rec).toMatchObject({ outcome: 'repeat', prescription: { loadKg: 18, reps: [5, 6, 6] } })
  })

  it('repeats the target when the load was lighter than planned', () => {
    const rec = evaluateExercise(
      repsLog({ plannedLoad: 18, plannedReps: [5, 6, 6], actualReps: [5, 5, 5], actualLoads: [16, 16, 16] }),
    )
    expect(rec).toMatchObject({ outcome: 'repeat', prescription: { loadKg: 18, reps: [5, 6, 6] } })
  })

  it('repeats when only the last set dropped to a lighter load', () => {
    const rec = evaluateExercise(
      repsLog({ plannedLoad: 18, plannedReps: [5, 5, 5], actualLoads: [18, 18, 16] }),
    )
    expect(rec.outcome).toBe('repeat')
  })

  it('suggests the next load and resets to the bottom rung at the top', () => {
    const rec = evaluateExercise(repsLog({ plannedLoad: 18, plannedReps: [6, 6, 6] }))
    expect(rec).toMatchObject({
      outcome: 'increase-load',
      prescription: { loadKg: 20, reps: [5, 5, 5] },
    })
    expect(rec.chooseResistance).toBeFalsy()
  })

  it('adds the load step to the heavier load actually lifted at the top rung', () => {
    const rec = evaluateExercise(
      repsLog({ plannedLoad: 18, plannedReps: [6, 6, 6], actualLoads: [20, 20, 20] }),
    )
    expect(rec).toMatchObject({ outcome: 'increase-load', prescription: { loadKg: 22, reps: [5, 5, 5] } })
  })

  it('advances at a heavier load when the reps were met with it', () => {
    const heavier = evaluateExercise(
      repsLog({ plannedLoad: 18, plannedReps: [5, 5, 5], actualLoads: [20, 20, 20] }),
    )
    expect(heavier.prescription).toEqual({ kind: 'reps', loadKg: 20, reps: [5, 5, 6] })

    const mixed = evaluateExercise(
      repsLog({ plannedLoad: 18, plannedReps: [5, 5, 5], actualLoads: [20, 20, 18] }),
    )
    expect(mixed.prescription).toEqual({ kind: 'reps', loadKg: 18, reps: [5, 5, 6] })
  })

  it('never skips rungs on over-performance', () => {
    const rec = evaluateExercise(repsLog({ plannedLoad: 18, plannedReps: [5, 5, 6], actualReps: [6, 6, 6] }))
    expect(rec.prescription).toMatchObject({ reps: [5, 6, 6] })
  })

  it('repeats when a planned set was skipped', () => {
    const rec = evaluateExercise(repsLog({ plannedLoad: 18, plannedReps: [5, 5, 5], actualReps: [5, null, 5] }))
    expect(rec.outcome).toBe('repeat')
  })

  it('ignores added sets when judging success', () => {
    const rec = evaluateExercise(
      repsLog({ plannedLoad: 18, plannedReps: [5, 5, 5], added: [{ reps: 2, loadKg: 14 }] }),
    )
    expect(rec).toMatchObject({ outcome: 'advance', prescription: { loadKg: 18, reps: [5, 5, 6] } })
  })

  it('reports not-performed and repeats when no planned set was done', () => {
    const rec = evaluateExercise(repsLog({ plannedLoad: 18, plannedReps: [5, 5, 5], status: 'pending' }))
    expect(rec).toMatchObject({ outcome: 'not-performed', prescription: { loadKg: 18, reps: [5, 5, 5] } })
  })
})

describe('evaluateExercise — bodyweight', () => {
  it('suggests added resistance at the bodyweight top rung and flags the choice', () => {
    const rec = evaluateExercise(
      repsLog({ id: 'pull-ups', loadType: 'bodyweight', plannedLoad: 0, plannedReps: [6, 6, 6] }),
    )
    expect(rec).toMatchObject({
      outcome: 'increase-load',
      chooseResistance: true,
      prescription: { loadKg: 2.5, reps: [5, 5, 5] },
    })
  })

  it('reduces assistance at the assisted top rung', () => {
    const rec = evaluateExercise(
      repsLog({ id: 'dips', loadType: 'bodyweight', plannedLoad: -10, plannedReps: [6, 6, 6] }),
    )
    expect(rec.prescription).toMatchObject({ loadKg: -7.5, reps: [5, 5, 5] })
  })

  it('adds to existing added weight at the top rung', () => {
    const rec = evaluateExercise(
      repsLog({ id: 'dips', loadType: 'bodyweight', plannedLoad: 5, plannedReps: [6, 6, 6] }),
    )
    expect(rec.prescription).toMatchObject({ loadKg: 7.5 })
  })

  it('builds on the added weight actually used at the top rung', () => {
    const rec = evaluateExercise(
      repsLog({
        id: 'pull-ups',
        loadType: 'bodyweight',
        plannedLoad: 0,
        plannedReps: [6, 6, 6],
        actualLoads: [2.5, 2.5, 2.5],
      }),
    )
    expect(rec).toMatchObject({ chooseResistance: true, prescription: { loadKg: 5, reps: [5, 5, 5] } })
  })

  it('repeats when an assisted set replaced a bodyweight one', () => {
    const rec = evaluateExercise(
      repsLog({
        id: 'dips',
        loadType: 'bodyweight',
        plannedLoad: 0,
        plannedReps: [5, 5, 5],
        actualLoads: [0, 0, -5],
      }),
    )
    expect(rec.outcome).toBe('repeat')
  })
})

describe('evaluateExercise — hammer curls', () => {
  it('moves from 10/10 to a heavier dumbbell at 8/8', () => {
    const rec = evaluateExercise(
      repsLog({ id: 'hammer-curls', plannedLoad: 10, plannedReps: [10, 10], min: 8, max: 10 }),
    )
    expect(rec).toMatchObject({ outcome: 'increase-load', prescription: { loadKg: 12, reps: [8, 8] } })
  })

  it('walks the 8–10 staircase', () => {
    const rec = evaluateExercise(
      repsLog({ id: 'hammer-curls', plannedLoad: 10, plannedReps: [8, 9], min: 8, max: 10 }),
    )
    expect(rec.prescription).toMatchObject({ reps: [9, 9] })
  })
})

describe('evaluateExercise — timed carry', () => {
  it('adds 5 s when all four efforts reach the target', () => {
    const rec = evaluateExercise(carryLog({ plannedSeconds: 40 }))
    expect(rec).toMatchObject({
      targetId: 'suitcase-carry',
      outcome: 'advance',
      prescription: { kind: 'timed', loadKg: 18, seconds: 45, setsPerSide: 2 },
    })
  })

  it('repeats when one side falls short', () => {
    const rec = evaluateExercise(carryLog({ plannedSeconds: 40, actualSeconds: [40, 40, 40, 35] }))
    expect(rec).toMatchObject({ outcome: 'repeat', prescription: { seconds: 40 } })
  })

  it('suggests +2 kg and resets to 40 s at the 60 s cap', () => {
    const rec = evaluateExercise(carryLog({ plannedSeconds: 60 }))
    expect(rec).toMatchObject({ outcome: 'increase-load', prescription: { loadKg: 20, seconds: 40 } })
  })

  it('repeats when carried lighter than planned', () => {
    const rec = evaluateExercise(carryLog({ plannedSeconds: 40, actualLoad: 16 }))
    expect(rec).toMatchObject({ outcome: 'repeat', prescription: { loadKg: 18, seconds: 40 } })
  })

  it('reports not-performed when no effort was done', () => {
    const rec = evaluateExercise(carryLog({ status: 'pending' }))
    expect(rec.outcome).toBe('not-performed')
  })
})

describe('evaluateExercise — bodyweight hold', () => {
  const plank = (seconds: number, actual?: (number | null)[]) => ({
    ...carryLog({ plannedLoad: 0, plannedSeconds: seconds, actualSeconds: actual }),
    exerciseId: 'copenhagen-plank',
    loadType: 'bodyweight' as const,
    loadStepKg: 2.5,
    style: 'hold' as const,
    mode: 'hold' as const,
    scheme: { type: 'timed' as const, setsPerSide: 2, minSec: 20, maxSec: 40, stepSec: 5 },
  })

  it('asks for more resistance at the top of the range and restarts at the bottom', () => {
    const rec = evaluateExercise(plank(40))
    expect(rec.outcome).toBe('increase-load')
    expect(rec.chooseResistance).toBe(true)
    expect(rec.prescription).toEqual({ kind: 'timed', loadKg: 2.5, seconds: 20, setsPerSide: 2 })
  })

  it('adds 5 s below the top and repeats a short hold', () => {
    expect(evaluateExercise(plank(35)).prescription).toMatchObject({ seconds: 40 })
    expect(evaluateExercise(plank(35)).chooseResistance).toBeUndefined()
    expect(evaluateExercise(plank(30, [30, 30, 30, 25])).outcome).toBe('repeat')
  })

  it('never asks a dumbbell carry to choose', () => {
    expect(evaluateExercise(carryLog({ plannedSeconds: 60 })).chooseResistance).toBeUndefined()
  })
})
