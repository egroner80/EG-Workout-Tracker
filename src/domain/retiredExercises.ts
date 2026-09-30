import type { ExerciseDef, WorkoutTemplate } from './types'

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
