import type { TimerState, WorkoutSession } from '../types'
import { remainingMs } from './timer'

/**
 * Feedback events emitted by the workout engine. The device layer turns them
 * into sound, vibration, and a full-screen flash; the engine never touches
 * device APIs itself.
 */
export type CueEvent =
  | { type: 'tick'; secondsLeft: number }
  | { type: 'go' }
  | { type: 'complete' }
  | { type: 'switch-sides' }

/** Cues older than this are stale (the app was hidden); play nothing. */
export const CUE_FRESHNESS_MS = 1000

export function isFresh(eventAt: number, now: number): boolean {
  return now - eventAt <= CUE_FRESHNESS_MS
}

function runningCountdowns(session: WorkoutSession): TimerState[] {
  const runtime = session.runtime
  if (!runtime) return []
  const timers: (TimerState | null | undefined)[] = [
    runtime.warmup.getReady,
    runtime.warmup.timer,
    runtime.rest && !runtime.rest.finishedAt ? runtime.rest.timer : null,
    runtime.effort?.timer,
  ]
  return timers.filter((t): t is TimerState => Boolean(t && t.running))
}

/**
 * "Tick" cues for the last three seconds of every running countdown, emitted
 * once per second boundary crossed between two ticker frames. A long gap
 * (the app was hidden) produces nothing.
 */
export function countdownTicks(session: WorkoutSession, previousNow: number, now: number): CueEvent[] {
  if (now <= previousNow || now - previousNow > CUE_FRESHNESS_MS) return []
  const events: CueEvent[] = []
  for (const timer of runningCountdowns(session)) {
    const before = Math.ceil(remainingMs(timer, previousNow) / 1000)
    const after = Math.ceil(remainingMs(timer, now) / 1000)
    if (after < before && after >= 1 && after <= 3) events.push({ type: 'tick', secondsLeft: after })
  }
  events.push(...sideSwitchCues(session, previousNow, now))
  return events
}

/** A per-side warm-up step: 3-2-1 before its midpoint, then "switch sides" at it. */
function sideSwitchCues(session: WorkoutSession, previousNow: number, now: number): CueEvent[] {
  const runtime = session.runtime
  const timer = runtime?.warmup.timer
  const step = runtime ? session.warmup[runtime.warmup.index] : undefined
  if (!timer?.running || !step?.perSide) return []
  const secondSideMs = step.plannedSec * 1000
  // Whole seconds left on the first side.
  const before = Math.ceil((remainingMs(timer, previousNow) - secondSideMs) / 1000)
  const after = Math.ceil((remainingMs(timer, now) - secondSideMs) / 1000)
  if (after >= before) return []
  if (after >= 1 && after <= 3) return [{ type: 'tick', secondsLeft: after }]
  return after <= 0 && before > 0 ? [{ type: 'switch-sides' }] : []
}
