import { describe, expect, it } from 'vitest'
import { isValidTemplate } from '../../domain/migrate'
import { bottomRung } from '../../domain/progression/staircase'
import { ROPE_BLOCK, SQUAT_ROUTINE } from '../../domain/sharedWarmup'
import { createDefaultTemplates, createTemplate } from './defaultTemplate'

const squatIds = SQUAT_ROUTINE.map((step) => step.id)

describe('workout seeds', () => {
  const { upper, lower } = createDefaultTemplates()

  it('are valid templates', () => {
    expect(isValidTemplate(upper)).toBe(true)
    expect(isValidTemplate(lower)).toBe(true)
  })

  it('share the jump-rope block and the squat routine, step for step', () => {
    for (const { id } of [...ROPE_BLOCK, ...SQUAT_ROUTINE]) {
      expect(lower.warmup.find((s) => s.id === id), id).toEqual(upper.warmup.find((s) => s.id === id))
    }
  })

  it('runs the lower warm-up in the requested order, after the jump rope and squat routine', () => {
    expect(lower.warmup.map((s) => s.id)).toEqual([
      'jump-rope',
      'double-unders',
      ...squatIds,
      'ankle-rocks',
      'hip-90-90-switches',
      'adductor-rock-backs',
      'worlds-greatest-stretch',
      'hip-hinges',
      'bw-split-squats',
      'glute-bridges',
    ])
    const step = (id: string) => lower.warmup.find((s) => s.id === id)
    expect(step('ankle-rocks')?.cue).toBe('Knee travels over the toes while the heel stays down')
    expect(step('worlds-greatest-stretch')).toMatchObject({ durationSec: 30, perSide: true })
    expect(step('hip-hinges')).toMatchObject({ reps: 10 })
    expect(step('bw-split-squats')).toMatchObject({ reps: 6, perSide: true })
    expect(step('glute-bridges')).toMatchObject({ reps: 10, cue: 'Pause 1 s at the top' })
  })

  it('works the shoulders and upper back one side at a time, 30 s each side', () => {
    const step = (id: string) => upper.warmup.find((s) => s.id === id)
    expect(step('shoulder-cars')).toMatchObject({ durationSec: 30, perSide: true, cue: 'Slow, controlled circles — one arm at a time' })
    expect(step('thoracic-rotations')).toMatchObject({ durationSec: 30, perSide: true })
  })

  it('runs the squat routine as four flowing 30 s holds, then five slow squats', () => {
    expect(SQUAT_ROUTINE.map((s) => [s.durationSec, s.reps ?? null, s.flowGroup])).toEqual([
      [30, null, 'squat-routine'],
      [30, null, 'squat-routine'],
      [30, null, 'squat-routine'],
      [30, null, 'squat-routine'],
      [30, 5, 'squat-routine'],
    ])
  })

  it('gives the lower exercises three sets, and the hamstring curl and Copenhagen plank two', () => {
    expect(lower.exercises.map((e) => [e.id, e.kind === 'reps' ? e.scheme.sets : e.scheme.setsPerSide])).toEqual([
      ['bulgarian-split-squat', 3],
      ['single-leg-rdl', 3],
      ['single-leg-hip-thrust', 3],
      ['sliding-hamstring-curl', 2],
      ['copenhagen-plank', 2],
    ])
    expect(lower.exercises.find((e) => e.id === 'single-leg-hip-thrust')).toMatchObject({
      name: 'Single-leg hip thrust',
      shortName: 'SL hip thrust',
      loadType: 'dumbbell',
      loadStepKg: 2,
      perSide: true,
      scheme: { minReps: 5, maxReps: 8 },
      baseline: { loadKg: 12, reps: [5, 5, 5] },
    })
    expect(lower.exercises.at(-1)).toMatchObject({
      kind: 'carry',
      style: 'hold',
      loadType: 'bodyweight',
      perSide: true,
      scheme: { minSec: 20, maxSec: 40, stepSec: 5 },
    })
  })

  it('uses strength rep ranges and starts every exercise at the bottom of its range', () => {
    const reps = [...upper.exercises, ...lower.exercises].flatMap((e) => (e.kind === 'reps' ? [e] : []))
    expect(reps.map((e) => [e.id, `${e.scheme.minReps}–${e.scheme.maxReps}`])).toEqual([
      ['pull-ups', '5–6'],
      ['dips', '5–6'],
      ['db-row', '4–8'],
      ['db-bench', '4–8'],
      ['db-press', '4–8'],
      ['hammer-curls', '6–12'],
      ['reverse-crunch', '8–12'],
      ['bulgarian-split-squat', '5–8'],
      ['single-leg-rdl', '5–8'],
      ['single-leg-hip-thrust', '5–8'],
      ['sliding-hamstring-curl', '8–10'],
    ])
    for (const e of reps) expect(e.baseline.reps, e.id).toEqual(bottomRung(e.scheme.sets, e.scheme.minReps))
  })

  it('hands out fresh copies', () => {
    const template = createTemplate('lower')
    template.warmup[0].name = 'Changed'
    expect(createTemplate('lower').warmup[0].name).toBe('Jump rope')
  })
})
