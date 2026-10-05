import { bottomRung } from './progression/staircase'
import type { ExerciseDef, StaircaseScheme, WarmupStepDef, WorkoutTemplate } from './types'

/*
 * Changes to the built-in workouts that must also reach workouts already saved
 * on a device or in a backup: startup and restore run every template through
 * reviseTemplate. Each revision leaves the user's own edits alone and returns
 * the same template when there is nothing left to change, so running it again
 * is harmless.
 */

// ---------------------------------------------------------------------------
// Strength rep ranges
//
// Strength comes from heavy sets: about 80% of max or more, roughly 8 reps or
// fewer. Each range is also wide enough to absorb one load step, which costs
// about 3 reps per 10% added: 2 kg on a 12–18 kg dumbbell needs 4–8, while a
// lift where body weight is most of the load loses about a rep.

type RepRange = Pick<StaircaseScheme, 'minReps' | 'maxReps'>

/** One-arm row, bench press and overhead press with dumbbells. */
export const DUMBBELL_RANGE: RepRange = { minReps: 4, maxReps: 8 }
/** Split squat, single-leg RDL and hip thrust: body weight is most of the load. */
export const ONE_LEG_RANGE: RepRange = { minReps: 5, maxReps: 8 }
/** Hammer curls: 2 kg is a fifth of a 10 kg dumbbell, about 5–6 reps. */
export const CURL_RANGE: RepRange = { minReps: 6, maxReps: 12 }
/** Weighted reverse crunch: the legs are part of the load, so a step costs a rep or two. */
export const CRUNCH_RANGE: RepRange = { minReps: 8, maxReps: 12 }

// ---------------------------------------------------------------------------
// Retired exercises

/**
 * The lower-body hip thrust, one leg at a time with a dumbbell on the hip. It
 * replaced the two-leg hip thrust under a new id, so its targets start from
 * this baseline rather than from the two-leg loads.
 */
export const SINGLE_LEG_HIP_THRUST: ExerciseDef = {
  id: 'single-leg-hip-thrust',
  kind: 'reps',
  name: 'Single-leg hip thrust',
  shortName: 'SL hip thrust',
  loadType: 'dumbbell',
  loadStepKg: 2,
  perSide: true,
  restSec: 90,
  scheme: { type: 'staircase', sets: 3, ...ONE_LEG_RANGE },
  baseline: { kind: 'reps', loadKg: 12, reps: [5, 5, 5] },
}

/** Built-in exercises the app no longer prescribes, by id, with what took their place. */
const SUCCESSORS = new Map<string, ExerciseDef>([['hip-thrust', SINGLE_LEG_HIP_THRUST]])

/**
 * Swaps each retired exercise for its successor in the same slot, so a workout
 * saved or backed up before the swap gets it too; everything else in the
 * workout stays as the user left it. A retired id never comes back (exercises
 * added in Settings get random ids), so this is safe on every start and every
 * restore. Returns the same template when there is nothing to swap.
 */
export function replaceRetiredExercises(template: WorkoutTemplate): WorkoutTemplate {
  if (!template.exercises.some((exercise) => SUCCESSORS.has(exercise.id))) return template
  const ids = new Set(template.exercises.map((exercise) => exercise.id))
  const exercises: ExerciseDef[] = []
  for (const exercise of template.exercises) {
    const successor = SUCCESSORS.get(exercise.id)
    if (!successor) {
      exercises.push(exercise)
    } else if (!ids.has(successor.id)) {
      // Once per workout: a successor already there means the retired one just goes.
      ids.add(successor.id)
      exercises.push(structuredClone(successor))
    }
  }
  return { ...template, exercises }
}

// ---------------------------------------------------------------------------
// Warm-up steps done one side at a time

export const SHOULDER_CARS: WarmupStepDef = {
  id: 'shoulder-cars',
  name: 'Shoulder CARs',
  durationSec: 30,
  perSide: true,
  cue: 'Slow, controlled circles — one arm at a time',
}

export const THORACIC_ROTATIONS: WarmupStepDef = {
  id: 'thoracic-rotations',
  name: 'Thoracic rotations',
  durationSec: 30,
  perSide: true,
  cue: 'Rotate through the upper back — one side at a time',
}

/** Upper-body steps that used to work both sides together, with the cue they had then. */
const NOW_PER_SIDE = new Map<string, { step: WarmupStepDef; previousCue: string }>([
  [SHOULDER_CARS.id, { step: SHOULDER_CARS, previousCue: 'Slow, controlled circles — both arms' }],
  [THORACIC_ROTATIONS.id, { step: THORACIC_ROTATIONS, previousCue: 'Rotate through the upper back' }],
])

/**
 * Turns Shoulder CARs and Thoracic rotations in a workout saved before they
 * went per side into 30 s on each side. Earlier versions never stored
 * `perSide` for them, while Settings' "Each side" toggle stores true or false,
 * so a step the user has set either way is left alone. A cue the user wrote
 * stays too. Returns the same template when nothing changes.
 */
export function splitPerSideSteps(template: WorkoutTemplate): WorkoutTemplate {
  if (!template.warmup.some((step) => NOW_PER_SIDE.has(step.id) && step.perSide === undefined)) return template
  const warmup = template.warmup.map((step) => {
    const revision = NOW_PER_SIDE.get(step.id)
    if (!revision || step.perSide !== undefined) return step
    const revised: WarmupStepDef = { ...step, perSide: true, durationSec: revision.step.durationSec }
    if (step.cue === revision.previousCue) revised.cue = revision.step.cue
    return revised
  })
  return { ...template, warmup }
}

// ---------------------------------------------------------------------------
// Moving saved workouts to the strength rep ranges

const FIVE_TO_SIX: RepRange = { minReps: 5, maxReps: 6 }

/** Built-in exercises moved to a strength range, with the range they had before. */
const RANGE_CHANGES = new Map<string, { previous: RepRange; range: RepRange }>([
  ['db-row', { previous: FIVE_TO_SIX, range: DUMBBELL_RANGE }],
  ['db-bench', { previous: FIVE_TO_SIX, range: DUMBBELL_RANGE }],
  ['db-press', { previous: FIVE_TO_SIX, range: DUMBBELL_RANGE }],
  ['bulgarian-split-squat', { previous: FIVE_TO_SIX, range: ONE_LEG_RANGE }],
  ['single-leg-rdl', { previous: FIVE_TO_SIX, range: ONE_LEG_RANGE }],
  [SINGLE_LEG_HIP_THRUST.id, { previous: FIVE_TO_SIX, range: ONE_LEG_RANGE }],
  ['hammer-curls', { previous: { minReps: 8, maxReps: 10 }, range: CURL_RANGE }],
  ['reverse-crunch', { previous: { minReps: 10, maxReps: 15 }, range: CRUNCH_RANGE }],
])

/** The range change still due for an exercise: one on the range it had before. */
function rangeChangeFor(exercise: ExerciseDef) {
  const change = RANGE_CHANGES.get(exercise.id)
  if (!change || exercise.kind !== 'reps') return undefined
  const { minReps, maxReps } = exercise.scheme
  return minReps === change.previous.minReps && maxReps === change.previous.maxReps ? change : undefined
}

/**
 * Moves built-in exercises still on their earlier rep range to the strength
 * range. A range set in Settings stays, and so does the number of sets.
 * Current targets are not touched: they keep what was actually done, and one
 * below the new minimum is flagged where it is shown. The starting point, used
 * only before the first workout with the exercise, moves to the new bottom
 * rung when it was at the old one. Returns the same template when nothing
 * changes.
 */
export function moveToStrengthRanges(template: WorkoutTemplate): WorkoutTemplate {
  if (!template.exercises.some(rangeChangeFor)) return template
  const exercises = template.exercises.map((exercise) => {
    const change = rangeChangeFor(exercise)
    if (!change || exercise.kind !== 'reps') return exercise
    const { baseline } = exercise
    const atBottom = baseline.reps.every((reps) => reps === change.previous.minReps)
    return {
      ...exercise,
      scheme: { ...exercise.scheme, ...change.range },
      baseline: atBottom ? { ...baseline, reps: bottomRung(baseline.reps.length, change.range.minReps) } : baseline,
    }
  })
  return { ...template, exercises }
}

/** Every revision above, for a template saved or backed up by an earlier version. */
export function reviseTemplate(template: WorkoutTemplate): WorkoutTemplate {
  return splitPerSideSteps(moveToStrengthRanges(replaceRetiredExercises(template)))
}
