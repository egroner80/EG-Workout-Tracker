import {
  CRUNCH_RANGE,
  CURL_RANGE,
  DUMBBELL_RANGE,
  ONE_LEG_RANGE,
  SHOULDER_CARS,
  SINGLE_LEG_HIP_THRUST,
  THORACIC_ROTATIONS,
} from '../../domain/templateRevisions'
import { ROPE_BLOCK, SQUAT_ROUTINE } from '../../domain/sharedWarmup'
import type { ExerciseDef, TemplateId, WarmupStepDef, WorkoutTemplate } from '../../domain/types'

/**
 * The user's two workouts. Ids are fixed slugs so a backup restored onto a
 * fresh install stays linked to its exercises. `updatedAt: 0` lets any
 * restored or edited template win over the seed. Both warm-ups open with the
 * shared jump-rope block and squat routine.
 */

const UPPER_WARMUP: WarmupStepDef[] = [
  ...ROPE_BLOCK,
  ...SQUAT_ROUTINE,
  SHOULDER_CARS,
  THORACIC_ROTATIONS,
  { id: 'scapular-pull-ups', name: 'Scapular pull-ups', durationSec: 45, cue: 'Straight arms, pull the shoulder blades down' },
  { id: 'easy-push-ups', name: 'Easy push-ups', durationSec: 45, cue: 'Smooth and easy — nowhere near failure' },
]

const LOWER_WARMUP: WarmupStepDef[] = [
  ...ROPE_BLOCK,
  ...SQUAT_ROUTINE,
  { id: 'ankle-rocks', name: 'Ankle rocks', durationSec: 45, cue: 'Knee travels over the toes while the heel stays down' },
  { id: 'hip-90-90-switches', name: '90-90 hip switches', durationSec: 45, cue: 'Sit tall and rotate the knees side to side' },
  { id: 'adductor-rock-backs', name: 'Adductor rock-backs', durationSec: 45, cue: 'One leg out wide; rock the hips back and forth' },
  {
    id: 'worlds-greatest-stretch',
    name: 'World’s greatest stretch',
    durationSec: 30,
    perSide: true,
    cue: 'Lunge, elbow to instep, then rotate and reach up',
  },
  { id: 'hip-hinges', name: 'Bodyweight hip hinges', durationSec: 30, reps: 10, cue: 'Push the hips back, flat back' },
  {
    id: 'bw-split-squats',
    name: 'Bodyweight Bulgarian split squat',
    durationSec: 60,
    reps: 6,
    perSide: true,
    cue: 'Rear foot up; slow and controlled',
  },
  { id: 'glute-bridges', name: 'Glute bridges', durationSec: 40, reps: 10, cue: 'Pause 1 s at the top' },
]

// Strength ranges (see templateRevisions.ts). Pull-ups and dips add 2.5 kg, about a rep, so 5–6 is enough.
const bodyweightStrength = { type: 'staircase', sets: 3, minReps: 5, maxReps: 6 } as const
const dumbbellStrength = { type: 'staircase', sets: 3, ...DUMBBELL_RANGE } as const
const oneLegStrength = { type: 'staircase', sets: 3, ...ONE_LEG_RANGE } as const

const UPPER_EXERCISES: ExerciseDef[] = [
  {
    id: 'pull-ups',
    kind: 'reps',
    name: 'Pull-ups',
    shortName: 'Pull-ups',
    loadType: 'bodyweight',
    loadStepKg: 2.5,
    perSide: false,
    restSec: 120,
    scheme: bodyweightStrength,
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
    scheme: bodyweightStrength,
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
    scheme: dumbbellStrength,
    baseline: { kind: 'reps', loadKg: 18, reps: [4, 4, 4] },
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
    scheme: dumbbellStrength,
    baseline: { kind: 'reps', loadKg: 16, reps: [4, 4, 4] },
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
    scheme: dumbbellStrength,
    baseline: { kind: 'reps', loadKg: 12, reps: [4, 4, 4] },
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
    scheme: { type: 'staircase', sets: 2, ...CURL_RANGE },
    baseline: { kind: 'reps', loadKg: 10, reps: [6, 6] },
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
    scheme: { type: 'staircase', sets: 3, ...CRUNCH_RANGE },
    baseline: { kind: 'reps', loadKg: 10, reps: [8, 8, 8] },
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

const LOWER_EXERCISES: ExerciseDef[] = [
  {
    id: 'bulgarian-split-squat',
    kind: 'reps',
    name: 'Bulgarian split squat',
    shortName: 'Split squat',
    loadType: 'dumbbell',
    loadStepKg: 2,
    perSide: true,
    restSec: 90,
    scheme: oneLegStrength,
    baseline: { kind: 'reps', loadKg: 12, reps: [5, 5, 5] },
  },
  {
    id: 'single-leg-rdl',
    kind: 'reps',
    name: 'Single-leg RDL',
    shortName: 'SL RDL',
    loadType: 'dumbbell',
    loadStepKg: 2,
    perSide: true,
    restSec: 90,
    scheme: oneLegStrength,
    baseline: { kind: 'reps', loadKg: 16, reps: [5, 5, 5] },
  },
  SINGLE_LEG_HIP_THRUST,
  {
    id: 'sliding-hamstring-curl',
    kind: 'reps',
    name: 'Sliding hamstring curl',
    shortName: 'Ham curl',
    loadType: 'bodyweight',
    loadStepKg: 2.5,
    perSide: false,
    restSec: 75,
    scheme: { type: 'staircase', sets: 2, minReps: 8, maxReps: 10 },
    baseline: { kind: 'reps', loadKg: 0, reps: [8, 8] },
  },
  {
    id: 'copenhagen-plank',
    kind: 'carry',
    style: 'hold',
    name: 'Copenhagen plank',
    shortName: 'Copenhagen',
    loadType: 'bodyweight',
    loadStepKg: 2.5,
    perSide: true,
    restSec: 60,
    scheme: { type: 'timed', setsPerSide: 2, minSec: 20, maxSec: 40, stepSec: 5 },
    baseline: { kind: 'timed', loadKg: 0, seconds: 20, setsPerSide: 2 },
  },
]

const WORKOUTS: Record<TemplateId, { warmup: WarmupStepDef[]; exercises: ExerciseDef[] }> = {
  upper: { warmup: UPPER_WARMUP, exercises: UPPER_EXERCISES },
  lower: { warmup: LOWER_WARMUP, exercises: LOWER_EXERCISES },
}

export function createTemplate(id: TemplateId): WorkoutTemplate {
  const { warmup, exercises } = WORKOUTS[id]
  return { id, warmup: structuredClone(warmup), exercises: structuredClone(exercises), updatedAt: 0 }
}

export function createDefaultTemplates(): Record<TemplateId, WorkoutTemplate> {
  return { upper: createTemplate('upper'), lower: createTemplate('lower') }
}
