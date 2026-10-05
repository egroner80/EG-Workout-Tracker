/** Time-based progression shared by the carry and progressive warm-up steps. */

export interface TimedRange {
  minSec: number
  maxSec: number
  stepSec: number
}

export interface TimedStep {
  seconds: number
  /** Already at the cap; the next step is a heavier load (or a hold). */
  topReached: boolean
}

export function advanceTimed(seconds: number, range: Pick<TimedRange, 'maxSec' | 'stepSec'>): TimedStep {
  if (seconds >= range.maxSec) return { seconds: range.maxSec, topReached: true }
  return { seconds: Math.min(seconds + range.stepSec, range.maxSec), topReached: false }
}

/**
 * The longest time every effort actually held, counted in steps up from the
 * planned time and stopping at the cap: planned 40 s held for 50, 55, 50 and
 * 52 s reaches 50 s.
 */
export function timeReached(planned: number, done: readonly number[], range: Pick<TimedRange, 'maxSec' | 'stepSec'>): number {
  const held = Math.min(...done)
  let reached = planned
  for (;;) {
    const step = advanceTimed(reached, range)
    if (step.topReached || step.seconds > held) return reached
    reached = step.seconds
  }
}
