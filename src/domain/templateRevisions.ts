import type { ExerciseDef, WarmupStepDef, WorkoutTemplate } from './types'

/*
 * Changes to the built-in workouts that must also reach workouts already saved
 * on a device or in a backup: startup and restore run every template through
 * reviseTemplate. Each revision leaves the user's own edits alone and returns
 * the same template when there is nothing left to change, so running it again
 * is harmless.
 */

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
  scheme: { type: 'staircase', sets: 3, minReps: 5, maxReps: 6 },
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

/** Every revision above, for a template saved or backed up by an earlier version. */
export function reviseTemplate(template: WorkoutTemplate): WorkoutTemplate {
  return splitPerSideSteps(replaceRetiredExercises(template))
}
