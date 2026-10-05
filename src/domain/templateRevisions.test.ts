import { describe, expect, it } from 'vitest'
import { createTemplate } from '../data/seed/defaultTemplate'
import { isValidTemplate } from './migrate'
import { bottomRung } from './progression/staircase'
import {
  SHOULDER_CARS,
  SINGLE_LEG_HIP_THRUST,
  THORACIC_ROTATIONS,
  moveToStrengthRanges,
  replaceRetiredExercises,
  reviseTemplate,
  splitPerSideSteps,
} from './templateRevisions'
import type { ExerciseDef, TemplateId, WarmupStepDef, WorkoutTemplate } from './types'

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

/** The rep ranges earlier versions shipped, where they differ from today's. */
const EARLIER_RANGES: Record<string, { minReps: number; maxReps: number }> = {
  'db-row': { minReps: 5, maxReps: 6 },
  'db-bench': { minReps: 5, maxReps: 6 },
  'db-press': { minReps: 5, maxReps: 6 },
  'hammer-curls': { minReps: 8, maxReps: 10 },
  'reverse-crunch': { minReps: 10, maxReps: 15 },
  'bulgarian-split-squat': { minReps: 5, maxReps: 6 },
  'single-leg-rdl': { minReps: 5, maxReps: 6 },
  'single-leg-hip-thrust': { minReps: 5, maxReps: 6 },
}

/** A workout saved before the strength ranges, each exercise starting at the bottom of its earlier range. */
function beforeStrengthRanges(id: TemplateId): WorkoutTemplate {
  const template = createTemplate(id)
  const exercises = template.exercises.map((exercise) => {
    const range = EARLIER_RANGES[exercise.id]
    if (!range || exercise.kind !== 'reps') return exercise
    const reps = bottomRung(exercise.scheme.sets, range.minReps)
    return { ...exercise, scheme: { ...exercise.scheme, ...range }, baseline: { ...exercise.baseline, reps } }
  })
  return { ...template, exercises, updatedAt: 1_000 }
}

const exercise = (template: WorkoutTemplate, id: string) => template.exercises.find((e) => e.id === id)

describe('moveToStrengthRanges', () => {
  it('moves every built-in exercise on its earlier range, and its untouched starting point, to the strength range', () => {
    for (const id of ['upper', 'lower'] as const) {
      const moved = moveToStrengthRanges(beforeStrengthRanges(id))
      expect(moved).toEqual({ ...createTemplate(id), updatedAt: 1_000 })
      expect(isValidTemplate(moved)).toBe(true)
    }
  })

  it('keeps a range or starting point the user set, and the number of sets', () => {
    const saved = beforeStrengthRanges('upper')
    const edited = {
      ...saved,
      exercises: saved.exercises.map((e) => {
        if (e.kind !== 'reps') return e
        if (e.id === 'db-row') return { ...e, scheme: { ...e.scheme, maxReps: 10 } }
        if (e.id === 'db-bench') return { ...e, scheme: { ...e.scheme, sets: 4 }, baseline: { ...e.baseline, loadKg: 20, reps: [5, 5, 5, 5] } }
        if (e.id === 'db-press') return { ...e, baseline: { ...e.baseline, reps: [6, 6, 6] } }
        return e
      }),
    }
    const moved = moveToStrengthRanges(edited)
    expect(exercise(moved, 'db-row')).toBe(exercise(edited, 'db-row'))
    expect(exercise(moved, 'db-bench')).toMatchObject({
      scheme: { sets: 4, minReps: 4, maxReps: 8 },
      baseline: { loadKg: 20, reps: [4, 4, 4, 4] },
    })
    expect(exercise(moved, 'db-press')).toMatchObject({ scheme: { minReps: 4, maxReps: 8 }, baseline: { reps: [6, 6, 6] } })
  })

  it('returns the same template once moved, and never touches an exercise added in Settings', () => {
    const upper = createTemplate('upper')
    expect(moveToStrengthRanges(upper)).toBe(upper)
    const row = exercise(upper, 'db-row')
    if (row?.kind !== 'reps') throw new Error('expected a reps exercise')
    const added = { ...upper, exercises: [...upper.exercises, { ...row, id: 'k3x9', scheme: { ...row.scheme, minReps: 5, maxReps: 6 } }] }
    expect(moveToStrengthRanges(added)).toBe(added)
  })
})

describe('reviseTemplate', () => {
  it('applies every revision and then has nothing left to change', () => {
    const revised = reviseTemplate(upperBeforeSplit())
    expect(warmupStep(revised, 'shoulder-cars')).toEqual(SHOULDER_CARS)
    expect(reviseTemplate(revised)).toBe(revised)
  })

  it('moves a saved workout to the strength ranges too', () => {
    const revised = reviseTemplate(beforeStrengthRanges('lower'))
    expect(revised).toEqual({ ...createTemplate('lower'), updatedAt: 1_000 })
    expect(reviseTemplate(revised)).toBe(revised)
  })
})
