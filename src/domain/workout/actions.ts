import { stepLoad } from '../load'
import { clamp } from '../math'
import type {
  ActualEffort,
  ActualSet,
  CarryExerciseLog,
  CarryMode,
  ExerciseLog,
  RepsExerciseLog,
  SessionRuntime,
  Side,
  WarmupRuntime,
  WarmupStepLog,
  WorkoutSession,
} from '../types'
import type { CueEvent } from './cues'
import { addTime, pauseTimer, remainingMs, resumeTimer, startTimer } from './timer'

/**
 * Pure workout transforms. Each takes the active session and returns the next
 * session plus any cue events; the store applies them synchronously and
 * persists the result. Planned values are never touched here.
 */

export const GET_READY_MS = 3000
export const CARRY_GET_READY_MS = 5000
export const SIDE_SWITCH_MS = 5000
export const MIN_REST_SEC = 15
export const MAX_REST_SEC = 600

export interface ActionContext {
  now: number
  getReadyCountdown: boolean
}

export interface ActionResult {
  session: WorkoutSession
  events: CueEvent[]
}

const result = (session: WorkoutSession, events: CueEvent[] = []): ActionResult => ({ session, events })

function runtimeOf(session: WorkoutSession): SessionRuntime {
  if (!session.runtime) throw new Error('The workout has no runtime state')
  return session.runtime
}

function touch(session: WorkoutSession, now: number): WorkoutSession {
  return { ...session, lastInteractionAt: now, updatedAt: now }
}

function withRuntime(session: WorkoutSession, patch: Partial<SessionRuntime>): WorkoutSession {
  return { ...session, runtime: { ...runtimeOf(session), ...patch } }
}

function withWarmupRuntime(session: WorkoutSession, patch: Partial<WarmupRuntime>): WorkoutSession {
  const runtime = runtimeOf(session)
  return withRuntime(session, { warmup: { ...runtime.warmup, ...patch } })
}

function updateStep(session: WorkoutSession, index: number, patch: Partial<WarmupStepLog>): WorkoutSession {
  return { ...session, warmup: session.warmup.map((step, i) => (i === index ? { ...step, ...patch } : step)) }
}

function updateExercise(
  session: WorkoutSession,
  exerciseId: string,
  update: (log: ExerciseLog) => ExerciseLog,
): WorkoutSession {
  return { ...session, exercises: session.exercises.map((log) => (log.exerciseId === exerciseId ? update(log) : log)) }
}

function findExercise(session: WorkoutSession, exerciseId: string): ExerciseLog | undefined {
  return session.exercises.find((log) => log.exerciseId === exerciseId)
}

// ---------------------------------------------------------------------------
// Warm-up

export function activeStepIndexes(session: WorkoutSession): number[] {
  return session.warmup.flatMap((step, i) => (step.active ? [i] : []))
}

/** A rep-counted step has no timer: the user taps Done. */
export function isRepStep<T extends Pick<WarmupStepLog, 'reps'>>(step: T): step is T & { reps: number } {
  return step.reps !== undefined
}

/**
 * Work time of a step: its duration, once per side for a timed per-side step.
 * A rep step's duration already estimates the whole step, both sides included.
 */
export function stepWorkMs(step: Pick<WarmupStepLog, 'plannedSec' | 'perSide' | 'reps'>): number {
  return step.plannedSec * 1000 * (step.perSide && !isRepStep(step) ? 2 : 1)
}

/**
 * Whether `next` starts the moment `ended` ends, with no get-ready: timed steps
 * of one flow group, one right after the other (the squat routine's holds).
 */
export function flowsInto(
  ended: Pick<WarmupStepLog, 'flowGroup' | 'reps'>,
  next: Pick<WarmupStepLog, 'flowGroup' | 'reps'>,
): boolean {
  return ended.flowGroup !== undefined && ended.flowGroup === next.flowGroup && !isRepStep(ended) && !isRepStep(next)
}

/** The side a per-side step is on, from the time left: left first, then right. */
export function sideAt(step: Pick<WarmupStepLog, 'plannedSec' | 'perSide'>, remaining: number): Side | undefined {
  if (!step.perSide) return undefined
  return remaining > step.plannedSec * 1000 ? 'L' : 'R'
}

/** Pauses the current step's timers and records its elapsed time before navigating away. */
function leaveCurrentStep(session: WorkoutSession, now: number): WorkoutSession {
  const { warmup } = runtimeOf(session)
  const step = session.warmup[warmup.index]
  let next = session
  if (step && warmup.timer) {
    next = updateStep(next, warmup.index, { elapsedMs: stepWorkMs(step) - remainingMs(warmup.timer, now) })
  }
  return withWarmupRuntime(next, { timer: null, getReady: null })
}

function moveToStep(session: WorkoutSession, index: number | undefined): WorkoutSession {
  if (index === undefined) return withRuntime(session, { phase: 'warmup-complete' })
  return withRuntime(withWarmupRuntime(session, { index, timer: null, getReady: null }), { phase: 'warmup' })
}

function nextActiveIndex(session: WorkoutSession, from: number): number | undefined {
  return activeStepIndexes(session).find((i) => i > from)
}

function previousActiveIndex(session: WorkoutSession, from: number): number | undefined {
  return activeStepIndexes(session)
    .filter((i) => i < from)
    .at(-1)
}

/** START: a fresh or redone step gets the get-ready countdown; a partial step resumes. Rep steps have no timer. */
export function startWarmupStep(session: WorkoutSession, ctx: ActionContext): ActionResult {
  const { warmup } = runtimeOf(session)
  const step = session.warmup[warmup.index]
  if (!step || isRepStep(step) || warmup.timer?.running || warmup.getReady?.running) return result(session)
  const resuming = !step.completed && step.elapsedMs > 0
  let next = updateStep(touch(session, ctx.now), warmup.index, { skipped: false })
  if (ctx.getReadyCountdown && !resuming) {
    next = withWarmupRuntime(next, { timer: null, getReady: startTimer(GET_READY_MS, ctx.now) })
    return result(next, [{ type: 'tick', secondsLeft: 3 }])
  }
  const workMs = stepWorkMs(step)
  const remaining = resuming ? workMs - step.elapsedMs : workMs
  next = withWarmupRuntime(next, {
    getReady: null,
    timer: { durationMs: workMs, running: true, endsAt: ctx.now + remaining, remainingMs: remaining },
  })
  return result(next, [{ type: 'go' }])
}

/**
 * DONE on a rep-counted step: records it and moves on in the same tap. A
 * timed step that follows counts in when the get-ready setting is on.
 */
export function completeRepStep(session: WorkoutSession, ctx: ActionContext): ActionResult {
  const { warmup } = runtimeOf(session)
  const step = session.warmup[warmup.index]
  if (!step || !isRepStep(step)) return result(session)
  const done = updateStep(touch(session, ctx.now), warmup.index, {
    completed: true,
    skipped: false,
    elapsedMs: stepWorkMs(step),
  })
  const nextIndex = nextActiveIndex(done, warmup.index)
  const moved = moveToStep(done, nextIndex)
  const upcoming = nextIndex === undefined ? undefined : moved.warmup[nextIndex]
  if (upcoming && !isRepStep(upcoming) && ctx.getReadyCountdown) {
    return result(withWarmupRuntime(moved, { getReady: startTimer(GET_READY_MS, ctx.now) }), [
      { type: 'tick', secondsLeft: 3 },
    ])
  }
  return result(moved)
}

export function pauseWarmup(session: WorkoutSession, ctx: ActionContext): ActionResult {
  const { warmup } = runtimeOf(session)
  const step = session.warmup[warmup.index]
  if (warmup.getReady) return result(withWarmupRuntime(touch(session, ctx.now), { getReady: null }))
  if (!step || !warmup.timer?.running) return result(session)
  const timer = pauseTimer(warmup.timer, ctx.now)
  const next = updateStep(touch(session, ctx.now), warmup.index, {
    elapsedMs: stepWorkMs(step) - timer.remainingMs,
  })
  return result(withWarmupRuntime(next, { timer }))
}

export function resumeWarmup(session: WorkoutSession, ctx: ActionContext): ActionResult {
  const { warmup } = runtimeOf(session)
  const step = session.warmup[warmup.index]
  if (!step) return result(session)
  if (warmup.timer && !warmup.timer.running) {
    return result(withWarmupRuntime(touch(session, ctx.now), { timer: resumeTimer(warmup.timer, ctx.now) }))
  }
  if (!warmup.timer && step.elapsedMs > 0 && !step.completed) {
    return startWarmupStep(session, { ...ctx, getReadyCountdown: false })
  }
  return result(session)
}

export function nextWarmupStep(session: WorkoutSession, ctx: ActionContext): ActionResult {
  const { warmup } = runtimeOf(session)
  const left = leaveCurrentStep(touch(session, ctx.now), ctx.now)
  return result(moveToStep(left, nextActiveIndex(left, warmup.index)))
}

export function previousWarmupStep(session: WorkoutSession, ctx: ActionContext): ActionResult {
  const runtime = runtimeOf(session)
  if (runtime.phase === 'warmup-complete') {
    const last = activeStepIndexes(session).at(-1)
    return result(moveToStep(touch(session, ctx.now), last))
  }
  const target = previousActiveIndex(session, runtime.warmup.index)
  if (target === undefined) return result(session)
  const left = leaveCurrentStep(touch(session, ctx.now), ctx.now)
  return result(moveToStep(left, target))
}

export function skipWarmupStep(session: WorkoutSession, ctx: ActionContext): ActionResult {
  const { warmup } = runtimeOf(session)
  const step = session.warmup[warmup.index]
  let next = leaveCurrentStep(touch(session, ctx.now), ctx.now)
  if (step && !step.completed) next = updateStep(next, warmup.index, { skipped: true })
  return result(moveToStep(next, nextActiveIndex(next, warmup.index)))
}

export function skipWarmup(session: WorkoutSession, ctx: ActionContext): ActionResult {
  return result(withRuntime(leaveCurrentStep(touch(session, ctx.now), ctx.now), { phase: 'strength' }))
}

export function startStrength(session: WorkoutSession, ctx: ActionContext): ActionResult {
  const first = session.exercises[0]?.exerciseId ?? ''
  return result(withRuntime(touch(session, ctx.now), { phase: 'strength', currentExerciseId: first }))
}

// ---------------------------------------------------------------------------
// Strength

export function goToExercise(session: WorkoutSession, exerciseId: string, ctx: ActionContext): ActionResult {
  if (!findExercise(session, exerciseId)) return result(session)
  return result(withRuntime(touch(session, ctx.now), { phase: 'strength', currentExerciseId: exerciseId }))
}

function repsLogOf(session: WorkoutSession, exerciseId: string): RepsExerciseLog | undefined {
  const log = findExercise(session, exerciseId)
  return log?.kind === 'reps' ? log : undefined
}

function carryLogOf(session: WorkoutSession, exerciseId: string): CarryExerciseLog | undefined {
  const log = findExercise(session, exerciseId)
  return log?.kind === 'carry' ? log : undefined
}

function withSet(log: RepsExerciseLog, index: number, patch: Partial<ActualSet>): RepsExerciseLog {
  return { ...log, actual: log.actual.map((set, i) => (i === index ? { ...set, ...patch } : set)) }
}

function startRestFor(session: WorkoutSession, exerciseId: string, now: number, startedBySet?: number): WorkoutSession {
  const log = findExercise(session, exerciseId)
  if (!log) return session
  return withRuntime(session, {
    rest: {
      exerciseId,
      timer: startTimer(log.restSec * 1000, now),
      ...(startedBySet !== undefined ? { startedBySet } : {}),
      expanded: true,
    },
  })
}

function cancelRestStartedBy(session: WorkoutSession, exerciseId: string, setIndex: number): WorkoutSession {
  const { rest } = runtimeOf(session)
  if (rest && rest.exerciseId === exerciseId && rest.startedBySet === setIndex) return withRuntime(session, { rest: null })
  return session
}

/** Tap on a rep chip: pending → done (starts rest); done → pending (cancels the rest it started). */
export function toggleSet(session: WorkoutSession, exerciseId: string, setIndex: number, ctx: ActionContext): ActionResult {
  const log = repsLogOf(session, exerciseId)
  const set = log?.actual[setIndex]
  if (!log || !set) return result(session)
  let next = touch(session, ctx.now)
  if (set.status === 'done') {
    next = updateExercise(next, exerciseId, () => withSet(log, setIndex, { status: 'pending' }))
    return result(cancelRestStartedBy(next, exerciseId, setIndex))
  }
  next = updateExercise(next, exerciseId, () => withSet(log, setIndex, { status: 'done' }))
  return result(startRestFor(next, exerciseId, ctx.now, setIndex))
}

/** −/+ on a set: changes actual reps and logs the set; only its first transition to done starts rest. */
export function stepReps(
  session: WorkoutSession,
  exerciseId: string,
  setIndex: number,
  delta: number,
  ctx: ActionContext,
): ActionResult {
  const log = repsLogOf(session, exerciseId)
  const set = log?.actual[setIndex]
  if (!log || !set) return result(session)
  const reps = clamp(set.reps + delta, 0, 99)
  let next = updateExercise(touch(session, ctx.now), exerciseId, () => withSet(log, setIndex, { reps, status: 'done' }))
  if (set.status !== 'done') next = startRestFor(next, exerciseId, ctx.now, setIndex)
  return result(next)
}

/** The load that sets not yet done will use (the stepper's displayed value). */
export function currentLoad(log: ExerciseLog): number {
  const pending = log.actual.find((set) => set.status === 'pending')
  return pending?.loadKg ?? log.actual.at(-1)?.loadKg ?? log.planned.loadKg
}

/** The weight stepper: changes only sets or efforts that are not done yet. */
export function stepExerciseLoad(
  session: WorkoutSession,
  exerciseId: string,
  direction: 1 | -1,
  ctx: ActionContext,
): ActionResult {
  const log = findExercise(session, exerciseId)
  if (!log || !log.actual.some((set) => set.status === 'pending')) return result(session)
  const nextLoad = stepLoad(log.loadType, currentLoad(log), log.loadStepKg, direction)
  const next = updateExercise(touch(session, ctx.now), exerciseId, (current) =>
    current.kind === 'reps'
      ? { ...current, actual: current.actual.map((set) => (set.status === 'pending' ? { ...set, loadKg: nextLoad } : set)) }
      : {
          ...current,
          actual: current.actual.map((effort) => (effort.status === 'pending' ? { ...effort, loadKg: nextLoad } : effort)),
        },
  )
  return result(next)
}

/** Edit mode: corrects the load of one set, done or not. */
export function stepSetLoad(
  session: WorkoutSession,
  exerciseId: string,
  setIndex: number,
  direction: 1 | -1,
  ctx: ActionContext,
): ActionResult {
  const log = repsLogOf(session, exerciseId)
  const set = log?.actual[setIndex]
  if (!log || !set) return result(session)
  const loadKg = stepLoad(log.loadType, set.loadKg, log.loadStepKg, direction)
  return result(updateExercise(touch(session, ctx.now), exerciseId, () => withSet(log, setIndex, { loadKg })))
}

export function toggleSkipSet(session: WorkoutSession, exerciseId: string, setIndex: number, ctx: ActionContext): ActionResult {
  const log = repsLogOf(session, exerciseId)
  const set = log?.actual[setIndex]
  if (!log || !set) return result(session)
  const skipping = set.status !== 'skipped'
  let next = updateExercise(touch(session, ctx.now), exerciseId, () =>
    withSet(log, setIndex, { status: skipping ? 'skipped' : 'pending' }),
  )
  if (skipping) next = cancelRestStartedBy(next, exerciseId, setIndex)
  return result(next)
}

export function addSet(session: WorkoutSession, exerciseId: string, ctx: ActionContext): ActionResult {
  const log = repsLogOf(session, exerciseId)
  if (!log) return result(session)
  const reps = log.planned.sets.at(-1)?.reps ?? log.actual.at(-1)?.reps ?? 5
  const added: ActualSet = { reps, loadKg: currentLoad(log), status: 'pending', added: true }
  return result(updateExercise(touch(session, ctx.now), exerciseId, () => ({ ...log, actual: [...log.actual, added] })))
}

/** Only sets added during the workout can be deleted; planned sets are skipped instead. */
export function deleteAddedSet(
  session: WorkoutSession,
  exerciseId: string,
  setIndex: number,
  ctx: ActionContext,
): ActionResult {
  const log = repsLogOf(session, exerciseId)
  if (!log?.actual[setIndex]?.added) return result(session)
  let next = cancelRestStartedBy(touch(session, ctx.now), exerciseId, setIndex)
  next = updateExercise(next, exerciseId, () => ({ ...log, actual: log.actual.filter((_, i) => i !== setIndex) }))
  const rest = runtimeOf(next).rest
  if (rest && rest.exerciseId === exerciseId && rest.startedBySet !== undefined && rest.startedBySet > setIndex) {
    next = withRuntime(next, { rest: { ...rest, startedBySet: rest.startedBySet - 1 } })
  }
  return result(next)
}

/** Today's rest for this exercise; defaults change only in Settings. */
export function setRestSec(session: WorkoutSession, exerciseId: string, restSec: number, ctx: ActionContext): ActionResult {
  const clamped = clamp(Math.round(restSec), MIN_REST_SEC, MAX_REST_SEC)
  return result(updateExercise(touch(session, ctx.now), exerciseId, (log) => ({ ...log, restSec: clamped })))
}

// ---------------------------------------------------------------------------
// Rest timer

export function startRest(session: WorkoutSession, exerciseId: string, ctx: ActionContext): ActionResult {
  return result(startRestFor(touch(session, ctx.now), exerciseId, ctx.now))
}

export function addRestTime(session: WorkoutSession, seconds: number, ctx: ActionContext): ActionResult {
  const { rest } = runtimeOf(session)
  if (!rest) return result(session)
  const timer = rest.finishedAt ? startTimer(seconds * 1000, ctx.now) : addTime(rest.timer, seconds * 1000, ctx.now)
  const nextRest = { ...rest, timer, expanded: true }
  delete nextRest.finishedAt
  return result(withRuntime(touch(session, ctx.now), { rest: nextRest }))
}

export function pauseRest(session: WorkoutSession, ctx: ActionContext): ActionResult {
  const { rest } = runtimeOf(session)
  if (!rest || rest.finishedAt || !rest.timer.running) return result(session)
  return result(withRuntime(touch(session, ctx.now), { rest: { ...rest, timer: pauseTimer(rest.timer, ctx.now) } }))
}

export function resumeRest(session: WorkoutSession, ctx: ActionContext): ActionResult {
  const { rest } = runtimeOf(session)
  if (!rest || rest.timer.running) return result(session)
  return result(withRuntime(touch(session, ctx.now), { rest: { ...rest, timer: resumeTimer(rest.timer, ctx.now) } }))
}

/** Skip or dismiss: removes the rest timer. */
export function endRest(session: WorkoutSession, ctx: ActionContext): ActionResult {
  if (!runtimeOf(session).rest) return result(session)
  return result(withRuntime(touch(session, ctx.now), { rest: null }))
}

export function setRestExpanded(session: WorkoutSession, expanded: boolean): ActionResult {
  const { rest } = runtimeOf(session)
  if (!rest || rest.expanded === expanded) return result(session)
  return result(withRuntime(session, { rest: { ...rest, expanded } }))
}

// ---------------------------------------------------------------------------
// Timed carry

function withEffort(log: CarryExerciseLog, index: number, patch: Partial<ActualEffort>): CarryExerciseLog {
  return { ...log, actual: log.actual.map((effort, i) => (i === index ? { ...effort, ...patch } : effort)) }
}

export function setCarryMode(session: WorkoutSession, exerciseId: string, mode: CarryMode, ctx: ActionContext): ActionResult {
  const log = carryLogOf(session, exerciseId)
  if (!log || log.mode === mode) return result(session)
  return result(updateExercise(touch(session, ctx.now), exerciseId, () => ({ ...log, mode })))
}

/** Opens the effort countdown after a get-ready for picking up the weight; cancels any rest. */
export function startEffort(
  session: WorkoutSession,
  exerciseId: string,
  effortIndex: number,
  ctx: ActionContext,
): ActionResult {
  const log = carryLogOf(session, exerciseId)
  if (!log?.actual[effortIndex]) return result(session)
  const next = withRuntime(touch(session, ctx.now), {
    rest: null,
    effort: { exerciseId, effortIndex, stage: 'get-ready', timer: startTimer(CARRY_GET_READY_MS, ctx.now) },
  })
  return result(next)
}

/** Stop: during a countdown it cancels without recording; while running it records the elapsed time. */
export function stopEffort(session: WorkoutSession, ctx: ActionContext): ActionResult {
  const { effort } = runtimeOf(session)
  if (!effort) return result(session)
  let next = withRuntime(touch(session, ctx.now), { effort: null })
  if (effort.stage === 'running') {
    const log = carryLogOf(session, effort.exerciseId)
    if (log) {
      const seconds = Math.floor((effort.timer.durationMs - remainingMs(effort.timer, ctx.now)) / 1000)
      next = updateExercise(next, effort.exerciseId, () => withEffort(log, effort.effortIndex, { seconds, status: 'done' }))
    }
  }
  return result(next)
}

export function pauseEffort(session: WorkoutSession, ctx: ActionContext): ActionResult {
  const { effort } = runtimeOf(session)
  if (!effort || effort.stage !== 'running' || !effort.timer.running) return result(session)
  return result(withRuntime(touch(session, ctx.now), { effort: { ...effort, timer: pauseTimer(effort.timer, ctx.now) } }))
}

export function resumeEffort(session: WorkoutSession, ctx: ActionContext): ActionResult {
  const { effort } = runtimeOf(session)
  if (!effort || effort.timer.running) return result(session)
  return result(withRuntime(touch(session, ctx.now), { effort: { ...effort, timer: resumeTimer(effort.timer, ctx.now) } }))
}

export function adjustEffort(
  session: WorkoutSession,
  exerciseId: string,
  effortIndex: number,
  deltaSec: number,
  ctx: ActionContext,
): ActionResult {
  const log = carryLogOf(session, exerciseId)
  const effort = log?.actual[effortIndex]
  if (!log || !effort) return result(session)
  const seconds = clamp(effort.seconds + deltaSec, 0, 600)
  return result(updateExercise(touch(session, ctx.now), exerciseId, () => withEffort(log, effortIndex, { seconds, status: 'done' })))
}

export function toggleSkipEffort(
  session: WorkoutSession,
  exerciseId: string,
  effortIndex: number,
  ctx: ActionContext,
): ActionResult {
  const log = carryLogOf(session, exerciseId)
  const effort = log?.actual[effortIndex]
  if (!log || !effort) return result(session)
  const status = effort.status === 'skipped' ? 'pending' : 'skipped'
  return result(updateExercise(touch(session, ctx.now), exerciseId, () => withEffort(log, effortIndex, { status })))
}
