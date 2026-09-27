import type { TimerState } from '../types'

/**
 * Wall-clock countdowns. A running timer stores its end time, a paused one its
 * remaining time, so the display survives reloads, backgrounding, and sleep.
 * Remaining time is clamped to 0…duration in case the device clock moves.
 */

export function startTimer(durationMs: number, now: number): TimerState {
  return { durationMs, running: true, endsAt: now + durationMs, remainingMs: durationMs }
}

export function remainingMs(timer: TimerState, now: number): number {
  const raw = timer.running ? timer.endsAt - now : timer.remainingMs
  return Math.min(timer.durationMs, Math.max(0, raw))
}

export function elapsedMs(timer: TimerState, now: number): number {
  return timer.durationMs - remainingMs(timer, now)
}

export function isExpired(timer: TimerState, now: number): boolean {
  return timer.running && now >= timer.endsAt
}

/** Whole seconds shown on a countdown (5.2 s left reads "6"; zero only at the end). */
export function secondsLeft(timer: TimerState, now: number): number {
  return Math.ceil(remainingMs(timer, now) / 1000)
}

export function pauseTimer(timer: TimerState, now: number): TimerState {
  if (!timer.running) return timer
  return { ...timer, running: false, remainingMs: remainingMs(timer, now) }
}

export function resumeTimer(timer: TimerState, now: number): TimerState {
  if (timer.running) return timer
  return { ...timer, running: true, endsAt: now + timer.remainingMs }
}

/** Extends a countdown; an already-expired running timer restarts from now. */
export function addTime(timer: TimerState, ms: number, now: number): TimerState {
  if (!timer.running) {
    return { ...timer, durationMs: timer.durationMs + ms, remainingMs: timer.remainingMs + ms }
  }
  const base = Math.max(timer.endsAt, now)
  const remaining = base + ms - now
  return { ...timer, durationMs: Math.max(timer.durationMs + ms, remaining), endsAt: base + ms }
}
