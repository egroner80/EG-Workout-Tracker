import type { CarryExerciseLog, SessionRuntime, WorkoutSession } from '../types'
import { activeStepIndexes, flowsInto, GET_READY_MS, isRepStep, SIDE_SWITCH_MS, stepWorkMs, type ActionResult } from './actions'
import { isFresh, type CueEvent } from './cues'
import { isExpired, startTimer } from './timer'

export interface ResyncContext {
  now: number
  /** The page is visible; only then may one step chain into the next. */
  visible: boolean
  getReadyCountdown: boolean
}

/**
 * Resolves every timer that has run out. Shared by the live ticker, startup
 * hydration, and returning to the app: each timer resolves exactly once,
 * nothing chains into a further step unless the app is visible and the
 * timer ended within the last second, and stale endings play no cue.
 * Running it twice changes nothing.
 */
export function resync(session: WorkoutSession, ctx: ResyncContext): ActionResult {
  let current = session
  const events: CueEvent[] = []
  // Each pass resolves one expiry; a long absence can stack several (get-ready → work → done).
  for (let guard = 0; guard < 32; guard++) {
    const step = resolveOne(current, ctx)
    if (!step) break
    current = step.session
    events.push(...step.events)
  }
  return { session: current, events }
}

function withRuntime(session: WorkoutSession, patch: Partial<SessionRuntime>): WorkoutSession {
  if (!session.runtime) return session
  return { ...session, runtime: { ...session.runtime, ...patch } }
}

function resolveOne(session: WorkoutSession, ctx: ResyncContext): ActionResult | null {
  const runtime = session.runtime
  if (!runtime || session.status !== 'active') return null
  const { now } = ctx
  const { warmup } = runtime

  // Warm-up get-ready countdown ended: the step's work timer starts at that moment.
  if (warmup.getReady && isExpired(warmup.getReady, now)) {
    const at = warmup.getReady.endsAt
    const step = session.warmup[warmup.index]
    if (!step || isRepStep(step)) return { session: withRuntime(session, { warmup: { ...warmup, getReady: null } }), events: [] }
    const next = withRuntime(session, {
      warmup: { ...warmup, getReady: null, timer: startTimer(stepWorkMs(step), at) },
    })
    return { session: next, events: isFresh(at, now) ? [{ type: 'go' }] : [] }
  }

  // Warm-up step reached zero: complete it and move on.
  if (warmup.timer && isExpired(warmup.timer, now)) {
    const at = warmup.timer.endsAt
    const fresh = isFresh(at, now)
    const index = warmup.index
    let next: WorkoutSession = {
      ...session,
      warmup: session.warmup.map((s, i) =>
        i === index ? { ...s, completed: true, skipped: false, elapsedMs: stepWorkMs(s) } : s,
      ),
    }
    const nextIndex = activeStepIndexes(next).find((i) => i > index)
    if (nextIndex === undefined) {
      next = withRuntime(next, { phase: 'warmup-complete', warmup: { ...warmup, timer: null, getReady: null } })
      return { session: next, events: fresh ? [{ type: 'complete' }] : [] }
    }
    const ended = session.warmup[index]
    const upcoming = next.warmup[nextIndex]
    if (ended && flowsInto(ended, upcoming) && ctx.visible && fresh) {
      next = withRuntime(next, {
        warmup: { index: nextIndex, timer: startTimer(stepWorkMs(upcoming), at), getReady: null },
      })
      // "complete" also flashes the screen: on a muted phone that is the only sign the hold changed.
      return { session: next, events: [{ type: 'complete' }] }
    }
    const chain = ctx.visible && fresh && ctx.getReadyCountdown && !isRepStep(upcoming)
    next = withRuntime(next, {
      warmup: { index: nextIndex, timer: null, getReady: chain ? startTimer(GET_READY_MS, at) : null },
    })
    return { session: next, events: fresh ? [{ type: 'complete' }] : [] }
  }

  // Rest reached zero: keep it on screen as overtime.
  if (runtime.rest && !runtime.rest.finishedAt && isExpired(runtime.rest.timer, now)) {
    const at = runtime.rest.timer.endsAt
    const next = withRuntime(session, { rest: { ...runtime.rest, finishedAt: at } })
    return { session: next, events: isFresh(at, now) ? [{ type: 'complete' }] : [] }
  }

  // Carry effort countdowns.
  const effort = runtime.effort
  if (effort && isExpired(effort.timer, now)) {
    const at = effort.timer.endsAt
    const fresh = isFresh(at, now)
    const log = session.exercises.find((e) => e.exerciseId === effort.exerciseId)
    if (!log || log.kind !== 'carry') return { session: withRuntime(session, { effort: null }), events: [] }
    const effortMs = (index: number) => (log.planned.efforts[index]?.seconds ?? log.planned.seconds) * 1000

    if (effort.stage === 'get-ready') {
      const next = withRuntime(session, {
        effort: { ...effort, stage: 'running', timer: startTimer(effortMs(effort.effortIndex), at) },
      })
      return { session: next, events: fresh ? [{ type: 'go' }] : [] }
    }

    if (effort.stage === 'switch') {
      if (!(ctx.visible && fresh)) return { session: withRuntime(session, { effort: null }), events: [] }
      const next = withRuntime(session, {
        effort: { ...effort, stage: 'running', timer: startTimer(effortMs(effort.effortIndex), at) },
      })
      return { session: next, events: [{ type: 'go' }] }
    }

    // Running side reached zero: record the target time.
    const done = log.actual[effort.effortIndex]
    const recorded: CarryExerciseLog = {
      ...log,
      actual: log.actual.map((e, i) =>
        i === effort.effortIndex ? { ...e, status: 'done', seconds: log.planned.efforts[i]?.seconds ?? e.seconds } : e,
      ),
    }
    let next: WorkoutSession = {
      ...session,
      exercises: session.exercises.map((e) => (e.exerciseId === log.exerciseId ? recorded : e)),
    }
    const pairIndex = recorded.actual.findIndex(
      (e, i) => i !== effort.effortIndex && e.setIndex === done?.setIndex && e.status === 'pending',
    )
    if (pairIndex >= 0 && ctx.visible && fresh) {
      next = withRuntime(next, {
        effort: { ...effort, effortIndex: pairIndex, stage: 'switch', timer: startTimer(SIDE_SWITCH_MS, at) },
      })
      return { session: next, events: [{ type: 'switch-sides' }] }
    }
    const setComplete = recorded.actual.filter((e) => e.setIndex === done?.setIndex).every((e) => e.status === 'done')
    next = withRuntime(next, {
      effort: null,
      ...(setComplete
        ? { rest: { exerciseId: log.exerciseId, timer: startTimer(log.restSec * 1000, at), expanded: true } }
        : {}),
    })
    return { session: next, events: fresh ? [{ type: 'complete' }] : [] }
  }

  return null
}
