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
