/**
 * Test builders for domain objects. Imported by tests only.
 */
import type {
  ActualEffort,
  ActualSet,
  CarryExerciseLog,
  LoadType,
  RepsExerciseLog,
  SetStatus,
  Side,
  WarmupStepLog,
} from './types'

interface RepsLogInput {
  id?: string
  loadType?: LoadType
  loadStepKg?: number
  plannedLoad: number
  plannedReps: number[]
  /** Actual reps per planned set; `null` marks the set skipped. */
  actualReps?: (number | null)[]
  /** Actual load per set; defaults to the planned load. */
  actualLoads?: number[]
  status?: SetStatus
  min?: number
  max?: number
  added?: { reps: number; loadKg?: number }[]
}

export function repsLog(input: RepsLogInput): RepsExerciseLog {
  const {
    id = 'db-row',
    loadType = 'dumbbell',
    loadStepKg = loadType === 'bodyweight' ? 2.5 : 2,
    plannedLoad,
    plannedReps,
    actualReps = plannedReps,
    actualLoads,
    status = 'done',
    min = 5,
    max = 6,
    added = [],
  } = input
  const actual: ActualSet[] = plannedReps.map((planned, i) => {
    const reps = actualReps[i]
    return {
      reps: reps ?? planned,
      loadKg: actualLoads?.[i] ?? plannedLoad,
      status: reps === null ? 'skipped' : status,
    }
  })
  for (const extra of added) {
    actual.push({ reps: extra.reps, loadKg: extra.loadKg ?? plannedLoad, status: 'done', added: true })
  }
  return {
    kind: 'reps',
    exerciseId: id,
    name: id,
    shortName: id,
    loadType,
    loadStepKg,
    perSide: false,
    restSec: 90,
    scheme: { type: 'staircase', sets: plannedReps.length, minReps: min, maxReps: max },
    planned: { loadKg: plannedLoad, sets: plannedReps.map((reps) => ({ reps })) },
    actual,
  }
}

interface CarryLogInput {
  plannedLoad?: number
  plannedSeconds?: number
  /** Actual seconds per effort in L1, R1, L2, R2 order; `null` = skipped. */
  actualSeconds?: (number | null)[]
  actualLoad?: number
  status?: SetStatus
}

export function carryLog(input: CarryLogInput = {}): CarryExerciseLog {
  const {
    plannedLoad = 18,
    plannedSeconds = 40,
    actualSeconds = [plannedSeconds, plannedSeconds, plannedSeconds, plannedSeconds],
    actualLoad = plannedLoad,
    status = 'done',
  } = input
  const order: [Side, number][] = [
    ['L', 0],
    ['R', 0],
    ['L', 1],
    ['R', 1],
  ]
  const actual: ActualEffort[] = order.map(([side, setIndex], i) => {
    const seconds = actualSeconds[i]
    return {
      side,
      setIndex,
      seconds: seconds ?? 0,
      loadKg: actualLoad,
      status: seconds === null ? 'skipped' : status,
    }
  })
  return {
    kind: 'carry',
    exerciseId: 'suitcase-carry',
    name: 'Suitcase carry',
    shortName: 'Carry',
    loadType: 'dumbbell',
    loadStepKg: 2,
    perSide: true,
    restSec: 60,
    scheme: { type: 'timed', setsPerSide: 2, minSec: 40, maxSec: 60, stepSec: 5 },
    mode: 'carry',
    planned: {
      loadKg: plannedLoad,
      seconds: plannedSeconds,
      efforts: order.map(([side, setIndex]) => ({ side, setIndex, seconds: plannedSeconds })),
    },
    actual,
  }
}

interface WarmupLogInput {
  stepId: string
  plannedSec: number
  elapsedSec?: number
  completed?: boolean
  skipped?: boolean
  active?: boolean
  progression?: WarmupStepLog['progression']
  activation?: WarmupStepLog['activation']
}

export function warmupLog(input: WarmupLogInput): WarmupStepLog {
  const { stepId, plannedSec, completed = false, skipped = false, active = true } = input
  const elapsedSec = input.elapsedSec ?? (completed ? plannedSec : 0)
  return {
    stepId,
    name: stepId,
    plannedSec,
    active,
    elapsedMs: elapsedSec * 1000,
    completed,
    skipped,
    progression: input.progression,
    activation: input.activation,
  }
}
