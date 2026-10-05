import { describe, expect, it } from 'vitest'
import { createTemplate } from '../data/seed/defaultTemplate'
import { isValidTemplate } from './migrate'
import {
  SHOULDER_CARS,
  SINGLE_LEG_HIP_THRUST,
  THORACIC_ROTATIONS,
  replaceRetiredExercises,
  reviseTemplate,
  splitPerSideSteps,
} from './templateRevisions'
import type { ExerciseDef, WarmupStepDef, WorkoutTemplate } from './types'

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

/** The upper-body warm-up as earlier versions saved it: shoulder and back steps for both sides at once. */
function upperBeforeSplit(): WorkoutTemplate {
  const upper = createTemplate('upper')
  const before: Record<string, WarmupStepDef> = {
    'shoulder-cars': { id: 'shoulder-cars', name: 'Shoulder CARs', durationSec: 45, cue: 'Slow, controlled circles — both arms' },
    'thoracic-rotations': { id: 'thoracic-rotations', name: 'Thoracic rotations', durationSec: 45, cue: 'Rotate through the upper back' },
  }
  return { ...upper, warmup: upper.warmup.map((step) => before[step.id] ?? step), updatedAt: 1_000 }
}

const warmupStep = (template: WorkoutTemplate, id: string) => template.warmup.find((step) => step.id === id)

describe('splitPerSideSteps', () => {
  it('turns the shoulder and back steps into 30 s on each side and leaves the rest alone', () => {
    const saved = upperBeforeSplit()
    const split = splitPerSideSteps(saved)
    expect(warmupStep(split, 'shoulder-cars')).toEqual(SHOULDER_CARS)
    expect(warmupStep(split, 'thoracic-rotations')).toEqual(THORACIC_ROTATIONS)
    expect(split.warmup.map((step) => step.id)).toEqual(saved.warmup.map((step) => step.id))
    expect(warmupStep(split, 'scapular-pull-ups')).toBe(warmupStep(saved, 'scapular-pull-ups'))
    expect(split.updatedAt).toBe(1_000)
    expect(isValidTemplate(split)).toBe(true)
  })

  it('keeps a cue the user wrote', () => {
    const saved = upperBeforeSplit()
    const edited = {
      ...saved,
      warmup: saved.warmup.map((step) => (step.id === 'shoulder-cars' ? { ...step, cue: 'Big slow circles' } : step)),
    }
    expect(warmupStep(splitPerSideSteps(edited), 'shoulder-cars')).toMatchObject({ perSide: true, durationSec: 30, cue: 'Big slow circles' })
  })

  it('leaves steps the user has set either way alone, including a duration they changed', () => {
    const upper = createTemplate('upper')
    expect(splitPerSideSteps(upper)).toBe(upper)
    const longer = {
      ...upper,
      warmup: upper.warmup.map((step) => (step.id === 'thoracic-rotations' ? { ...step, durationSec: 45 } : step)),
    }
    expect(splitPerSideSteps(longer)).toBe(longer)
    // "Each side" turned off in Settings stores false, which stays.
    const bothSides = {
      ...upper,
      warmup: upper.warmup.map((step) => (step.id === 'shoulder-cars' ? { ...step, perSide: false } : step)),
    }
    expect(splitPerSideSteps(bothSides)).toBe(bothSides)
    expect(splitPerSideSteps(createTemplate('lower'))).toEqual(createTemplate('lower'))
  })
})

describe('reviseTemplate', () => {
  it('applies every revision and then has nothing left to change', () => {
    const revised = reviseTemplate(upperBeforeSplit())
    expect(warmupStep(revised, 'shoulder-cars')).toEqual(SHOULDER_CARS)
    expect(reviseTemplate(revised)).toBe(revised)
  })
})
