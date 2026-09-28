import type { ExerciseDef, WarmupStepDef, WorkoutTemplate } from '../../domain/types'

/**
 * The user's workout. Ids are fixed slugs so a backup restored onto a fresh
 * install stays linked to its exercises. `updatedAt: 0` lets any restored or
 * edited template win over the seed.
 */

export const DEFAULT_WARMUP: WarmupStepDef[] = [
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
  { id: 'shoulder-cars', name: 'Shoulder CARs', durationSec: 45, cue: 'Slow, controlled circles — both arms' },
  { id: 'thoracic-rotations', name: 'Thoracic rotations', durationSec: 45, cue: 'Rotate through the upper back' },
  { id: 'scapular-pull-ups', name: 'Scapular pull-ups', durationSec: 45, cue: 'Straight arms, pull the shoulder blades down' },
  { id: 'easy-push-ups', name: 'Easy push-ups', durationSec: 45, cue: 'Smooth and easy — nowhere near failure' },
]

const fiveToSix = { type: 'staircase', sets: 3, minReps: 5, maxReps: 6 } as const

export const DEFAULT_EXERCISES: ExerciseDef[] = [
  {
    id: 'pull-ups',
    kind: 'reps',
    name: 'Pull-ups',
    shortName: 'Pull-ups',
    loadType: 'bodyweight',
    loadStepKg: 2.5,
    perSide: false,
    restSec: 120,
    scheme: fiveToSix,
    baseline: { kind: 'reps', loadKg: 0, reps: [5, 5, 5] },
  },
  {
    id: 'dips',
    kind: 'reps',
    name: 'Dips',
    shortName: 'Dips',
    loadType: 'bodyweight',
    loadStepKg: 2.5,
    perSide: false,
    restSec: 120,
    scheme: fiveToSix,
    baseline: { kind: 'reps', loadKg: 0, reps: [5, 5, 5] },
  },
  {
    id: 'db-row',
    kind: 'reps',
    name: 'One-arm DB row',
    shortName: 'DB Row',
    loadType: 'dumbbell',
    loadStepKg: 2,
    perSide: true,
    restSec: 90,
    scheme: fiveToSix,
    baseline: { kind: 'reps', loadKg: 18, reps: [5, 5, 5] },
  },
  {
    id: 'db-bench',
    kind: 'reps',
    name: 'DB bench press',
    shortName: 'DB Bench',
    loadType: 'dumbbell',
    loadStepKg: 2,
    perSide: false,
    restSec: 90,
    scheme: fiveToSix,
    baseline: { kind: 'reps', loadKg: 16, reps: [5, 5, 5] },
  },
  {
    id: 'db-press',
    kind: 'reps',
    name: 'Standing DB press',
    shortName: 'DB Press',
    loadType: 'dumbbell',
    loadStepKg: 2,
    perSide: false,
    restSec: 90,
    scheme: fiveToSix,
    baseline: { kind: 'reps', loadKg: 12, reps: [5, 5, 5] },
  },
  {
    id: 'hammer-curls',
    kind: 'reps',
    name: 'DB hammer curls',
    shortName: 'Hammer curls',
    loadType: 'dumbbell',
    loadStepKg: 2,
    perSide: false,
    restSec: 75,
    scheme: { type: 'staircase', sets: 2, minReps: 8, maxReps: 10 },
    baseline: { kind: 'reps', loadKg: 10, reps: [8, 8] },
  },
  {
    id: 'reverse-crunch',
    kind: 'reps',
    name: 'Weighted reverse crunch',
    shortName: 'Reverse crunch',
    loadType: 'weight',
    loadStepKg: 2,
    perSide: false,
    restSec: 60,
    scheme: { type: 'staircase', sets: 3, minReps: 10, maxReps: 15 },
    baseline: { kind: 'reps', loadKg: 10, reps: [10, 10, 10] },
  },
  {
    id: 'suitcase-carry',
    kind: 'carry',
    name: 'Suitcase carry',
    shortName: 'Carry',
    loadType: 'dumbbell',
    loadStepKg: 2,
    perSide: true,
    restSec: 60,
    scheme: { type: 'timed', setsPerSide: 2, minSec: 40, maxSec: 60, stepSec: 5 },
    baseline: { kind: 'timed', loadKg: 18, seconds: 40, setsPerSide: 2 },
  },
]

export function createDefaultTemplate(): WorkoutTemplate {
  return {
    id: 'upper',
    warmup: structuredClone(DEFAULT_WARMUP),
    exercises: structuredClone(DEFAULT_EXERCISES),
    updatedAt: 0,
  }
}
