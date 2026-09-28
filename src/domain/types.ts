/**
 * Domain model. Pure data: no React, no Dexie.
 *
 * Loads are kilograms interpreted by the exercise's load type. For
 * bodyweight exercises the number is a signed delta kept separate from body
 * mass: 0 = bodyweight, positive = added weight, negative = assistance.
 */

export type LoadType = 'dumbbell' | 'weight' | 'bodyweight'

/** The two workouts the user alternates between. */
export type TemplateId = 'upper' | 'lower'

export interface StaircaseScheme {
  type: 'staircase'
  sets: number
  minReps: number
  maxReps: number
}

export interface TimedScheme {
  type: 'timed'
  setsPerSide: number
  minSec: number
  maxSec: number
  stepSec: number
}

export type ProgressionScheme = StaircaseScheme | TimedScheme

export interface RepsPrescription {
  kind: 'reps'
  loadKg: number
  reps: number[]
}

export interface TimedPrescription {
  kind: 'timed'
  loadKg: number
  seconds: number
  setsPerSide: number
}

export interface WarmupPrescription {
  kind: 'warmup'
  durationSec: number
  active: boolean
}

export type ExercisePrescription = RepsPrescription | TimedPrescription
export type Prescription = ExercisePrescription | WarmupPrescription

export type ExerciseKind = 'reps' | 'carry'

interface ExerciseDefBase {
  id: string
  name: string
  /** Compact name for lists and summaries, e.g. "DB Row". */
  shortName: string
  loadType: LoadType
  loadStepKg: number
  /** Reps are counted per side (one-arm row). */
  perSide: boolean
  restSec: number
}

export interface RepsExerciseDef extends ExerciseDefBase {
  kind: 'reps'
  scheme: StaircaseScheme
  baseline: RepsPrescription
}

/** A static hold done per side (Copenhagen plank): no carry variations, sides instead of hands. */
export type CarryStyle = 'hold'

export interface CarryExerciseDef extends ExerciseDefBase {
  kind: 'carry'
  scheme: TimedScheme
  baseline: TimedPrescription
  style?: CarryStyle
}

export type ExerciseDef = RepsExerciseDef | CarryExerciseDef

export interface WarmupProgression {
  stepSec: number
  maxSec: number
}

export interface WarmupActivation {
  /** The step whose progress unlocks this one. */
  afterStepId: string
  /** Unlocks once that step is completed at or beyond this duration. */
  whenDurationReachesSec: number
}

/** Optional step shapes shared by the definition and the logged step. */
interface WarmupStepShape {
  /** Counted in reps: no timer, the user taps Done. */
  reps?: number
  /** Done on each side: a timed step runs its duration once per side, with a switch at the midpoint. */
  perSide?: boolean
  /** Consecutive timed steps in the same group run back to back, without a get-ready countdown. */
  flowGroup?: string
}

export interface WarmupStepDef extends WarmupStepShape {
  id: string
  name: string
  /**
   * Seeded duration; progressive steps derive later durations from history.
   * A per-side step's duration is per side; a rep step's is an estimate of the whole step.
   */
  durationSec: number
  cue?: string
  progression?: WarmupProgression
  activation?: WarmupActivation
}

export interface WorkoutTemplate {
  id: TemplateId
  warmup: WarmupStepDef[]
  exercises: ExerciseDef[]
  updatedAt: number
}

export type SetStatus = 'pending' | 'done' | 'skipped'

export interface PlannedSet {
  reps: number
}

export interface ActualSet {
  reps: number
  loadKg: number
  status: SetStatus
  /** Added during the workout; never counts against the target. */
  added?: boolean
}

export type Side = 'L' | 'R'

export interface PlannedEffort {
  side: Side
  setIndex: number
  seconds: number
}

export interface ActualEffort {
  side: Side
  setIndex: number
  seconds: number
  loadKg: number
  status: SetStatus
}

export type CarryMode = 'carry' | 'march' | 'hold'

interface ExerciseLogBase {
  exerciseId: string
  name: string
  shortName: string
  loadType: LoadType
  loadStepKg: number
  perSide: boolean
  restSec: number
}

export interface RepsExerciseLog extends ExerciseLogBase {
  kind: 'reps'
  scheme: StaircaseScheme
  planned: { loadKg: number; sets: PlannedSet[] }
  /** Index-aligned with planned sets; added sets are appended. */
  actual: ActualSet[]
}

export interface CarryExerciseLog extends ExerciseLogBase {
  kind: 'carry'
  scheme: TimedScheme
  mode: CarryMode
  style?: CarryStyle
  planned: { loadKg: number; seconds: number; efforts: PlannedEffort[] }
  actual: ActualEffort[]
}

export type ExerciseLog = RepsExerciseLog | CarryExerciseLog

export interface WarmupStepLog extends WarmupStepShape {
  stepId: string
  name: string
  cue?: string
  plannedSec: number
  /** Inactive steps are carried for progression but not shown in the flow. */
  active: boolean
  elapsedMs: number
  /** Reached zero at least once; stays true through a redo. */
  completed: boolean
  skipped: boolean
  progression?: WarmupProgression
  activation?: WarmupActivation
}

export type WarmupStepStatus = 'untouched' | 'partial' | 'complete' | 'skipped'

export interface TimerState {
  durationMs: number
  running: boolean
  /** Wall-clock end time while running. */
  endsAt: number
  /** Remaining time while paused. */
  remainingMs: number
}

export type WorkoutPhase = 'warmup' | 'warmup-complete' | 'strength'

export interface WarmupRuntime {
  index: number
  timer: TimerState | null
  getReady: TimerState | null
}

export interface RestRuntime {
  exerciseId: string
  timer: TimerState
  /** The set whose completion started this rest, so un-marking can cancel it. */
  startedBySet?: number
  /** When the countdown reached zero; drives the overtime display. */
  finishedAt?: number
  expanded: boolean
}

export type EffortStage = 'get-ready' | 'running' | 'switch'

export interface EffortRuntime {
  exerciseId: string
  effortIndex: number
  stage: EffortStage
  timer: TimerState
}

export interface SessionRuntime {
  phase: WorkoutPhase
  currentExerciseId: string
  warmup: WarmupRuntime
  rest: RestRuntime | null
  effort: EffortRuntime | null
}

export type Outcome =
  | 'advance'
  | 'repeat'
  | 'increase-load'
  | 'not-performed'
  | 'hold'
  | 'activate'
  | 'inactive'

export interface Recommendation {
  targetId: string
  outcome: Outcome
  prescription: Prescription
  /** Bodyweight top rung: the user picks the next resistance. */
  chooseResistance?: boolean
}

export type SessionStatus = 'active' | 'completed' | 'discarded'
export type SessionSource = 'real' | 'demo'

export interface WorkoutSession {
  id: string
  /**
   * Which workout this was. Absent on workouts saved before the lower-body
   * workout existed; read it with `workoutTypeOf`.
   */
  templateId?: TemplateId
  status: SessionStatus
  source: SessionSource
  /** Present only while active; a unique index makes two active sessions impossible. */
  activeSlot?: 'active'
  rev: number
  startedAt: number
  finishedAt?: number
  lastInteractionAt: number
  createdAt: number
  updatedAt: number
  deletedAt?: number
  warmup: WarmupStepLog[]
  exercises: ExerciseLog[]
  /** Multi-entry index for per-exercise history. */
  exerciseIds: string[]
  runtime?: SessionRuntime
  recommendations?: Record<string, Recommendation>
  /** The finished version, kept while a completed workout is reopened for edits. */
  reopenSnapshot?: Omit<WorkoutSession, 'reopenSnapshot'>
}

export interface PrescriptionOverride {
  id: string
  targetId: string
  prescription: Prescription
  /** The recommendation this override replaced, to offer "Use suggestion" later. */
  replacedRecommendation?: Prescription
  createdAt: number
  updatedAt: number
}

export type ThemeSetting = 'dark' | 'light'

export interface AppSettings {
  sound: boolean
  alwaysAudible: boolean
  vibration: boolean
  getReadyCountdown: boolean
  keepScreenAwake: boolean
  theme: ThemeSetting
  updatedAt: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  sound: true,
  alwaysAudible: false,
  vibration: true,
  getReadyCountdown: true,
  keepScreenAwake: true,
  theme: 'dark',
  updatedAt: 0,
}
