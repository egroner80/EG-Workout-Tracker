import type { WarmupStepDef, WorkoutTemplate } from './types'

/**
 * Warm-up steps both workouts share. A shared step keeps the same id in both
 * templates, so its progression, unlocks, and manual targets carry across
 * workout types; each workout keeps its own order around them.
 */

export const ROPE_BLOCK: readonly WarmupStepDef[] = [
  {
    id: 'jump-rope',
    name: 'Jump rope',
    durationSec: 120,
    cue: 'Easy rhythm, light on your feet',
    progression: { stepSec: 10, maxSec: 300 },
  },
  {
    id: 'double-unders',
    name: 'Double unders',
    durationSec: 30,
    cue: 'Practice double unders; switch to singles when you trip',
    progression: { stepSec: 5, maxSec: 60 },
    activation: { afterStepId: 'jump-rope', whenDurationReachesSec: 300 },
  },
]

export const SQUAT_ROUTINE_GROUP = 'squat-routine'

/** Four holds in one continuous deep squat, then five slow squats. */
export const SQUAT_ROUTINE: readonly WarmupStepDef[] = [
  {
    id: 'deep-squat-hold',
    name: 'Deep squat',
    durationSec: 30,
    cue: 'Sink into the bottom and settle in',
    flowGroup: SQUAT_ROUTINE_GROUP,
  },
  {
    id: 'deep-squat-knee-push-outs',
    name: 'Deep squat · knee push-outs',
    durationSec: 30,
    cue: 'Stay deep and press the knees out',
    flowGroup: SQUAT_ROUTINE_GROUP,
  },
  {
    id: 'deep-squat-side-to-side',
    name: 'Deep squat · side to side',
    durationSec: 30,
    cue: 'Stay deep and explore side to side',
    flowGroup: SQUAT_ROUTINE_GROUP,
  },
  {
    id: 'deep-squat-breathing',
    name: 'Deep squat · breathe',
    durationSec: 30,
    cue: 'Relax at the bottom and breathe slowly',
    flowGroup: SQUAT_ROUTINE_GROUP,
  },
  {
    id: 'slow-squats',
    name: 'Slow bodyweight squats',
    durationSec: 30,
    reps: 5,
    cue: 'Come up, then five slow squats',
    flowGroup: SQUAT_ROUTINE_GROUP,
  },
]

const ROPE_IDS = new Set(ROPE_BLOCK.map((step) => step.id))
const SQUAT_IDS = new Set(SQUAT_ROUTINE.map((step) => step.id))

/**
 * Adds the squat routine right after the jump-rope block (or first, without
 * one). A warm-up that already has any of its steps is returned as is.
 */
export function insertSquatRoutine(warmup: WarmupStepDef[]): WarmupStepDef[] {
  if (warmup.some((step) => SQUAT_IDS.has(step.id))) return warmup
  const lastRope = warmup.findLastIndex((step) => ROPE_IDS.has(step.id))
  const at = lastRope + 1
  return [...warmup.slice(0, at), ...structuredClone(SQUAT_ROUTINE), ...warmup.slice(at)]
}

/**
 * Copies the definition of every warm-up step `source` shares with `target`
 * (same id) into `target`, keeping the target's order and its own steps.
 * Returns `target` itself when nothing differs, so callers can skip a write.
 */
export function syncSharedSteps(source: WorkoutTemplate, target: WorkoutTemplate): WorkoutTemplate {
  const sourceById = new Map(source.warmup.map((step) => [step.id, step]))
  let changed = false
  const warmup = target.warmup.map((step) => {
    const shared = sourceById.get(step.id)
    if (!shared || JSON.stringify(shared) === JSON.stringify(step)) return step
    changed = true
    return structuredClone(shared)
  })
  return changed ? { ...target, warmup } : target
}
