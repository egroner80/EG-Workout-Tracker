import { describe, expect, it } from 'vitest'
import { createTemplate } from '../data/seed/defaultTemplate'
import { isValidTemplate } from './migrate'
import { SINGLE_LEG_HIP_THRUST, replaceRetiredExercises } from './retiredExercises'
import type { ExerciseDef, WorkoutTemplate } from './types'

/** The two-leg hip thrust as earlier versions defined it. */
const TWO_LEG_HIP_THRUST: ExerciseDef = {
  id: 'hip-thrust',
  kind: 'reps',
  name: 'Hip thrust',
  shortName: 'Hip thrust',
  loadType: 'weight',
  loadStepKg: 2.5,
  perSide: false,
  restSec: 90,
  scheme: { type: 'staircase', sets: 3, minReps: 5, maxReps: 6 },
  baseline: { kind: 'reps', loadKg: 40, reps: [5, 5, 5] },
}

const ids = (template: WorkoutTemplate) => template.exercises.map((exercise) => exercise.id)

/** A lower-body workout saved before the swap, with the hip thrust moved first and the RDL's rest edited. */
function savedBeforeSwap(): WorkoutTemplate {
  const lower = createTemplate('lower')
  const others = lower.exercises
    .filter((exercise) => exercise.id !== SINGLE_LEG_HIP_THRUST.id)
    .map((exercise) => (exercise.id === 'single-leg-rdl' ? { ...exercise, restSec: 120 } : exercise))
  return { ...lower, exercises: [structuredClone(TWO_LEG_HIP_THRUST), ...others], updatedAt: 1_000 }
}

describe('replaceRetiredExercises', () => {
  it('puts the single-leg hip thrust where the two-leg one was and leaves the rest as the user set it', () => {
    const saved = savedBeforeSwap()
    const swapped = replaceRetiredExercises(saved)
    expect(ids(swapped)).toEqual([
      'single-leg-hip-thrust',
      'bulgarian-split-squat',
      'single-leg-rdl',
      'sliding-hamstring-curl',
      'copenhagen-plank',
    ])
    expect(swapped.exercises[0]).toEqual(SINGLE_LEG_HIP_THRUST)
    expect(swapped.exercises.find((exercise) => exercise.id === 'single-leg-rdl')?.restSec).toBe(120)
    expect(swapped.warmup).toEqual(saved.warmup)
    expect(swapped.updatedAt).toBe(1_000)
    expect(isValidTemplate(swapped)).toBe(true)
  })

  it('returns the same template when no retired exercise is left', () => {
    const lower = createTemplate('lower')
    const upper = createTemplate('upper')
    expect(replaceRetiredExercises(lower)).toBe(lower)
    expect(replaceRetiredExercises(upper)).toBe(upper)
    const once = replaceRetiredExercises(savedBeforeSwap())
    expect(replaceRetiredExercises(once)).toBe(once)
  })

  it('drops the two-leg hip thrust when the single-leg one is already there', () => {
    const lower = createTemplate('lower')
    const both = { ...lower, exercises: [...lower.exercises, structuredClone(TWO_LEG_HIP_THRUST)] }
    const swapped = replaceRetiredExercises(both)
    expect(ids(swapped)).toEqual(ids(lower))
    expect(isValidTemplate(swapped)).toBe(true)
  })

  it('hands out a copy, so later edits never reach the shared definition', () => {
    const swapped = replaceRetiredExercises(savedBeforeSwap())
    swapped.exercises[0].name = 'Changed'
    expect(SINGLE_LEG_HIP_THRUST.name).toBe('Single-leg hip thrust')
  })
})
