/**
 * The staircase progression: each success adds one rep to the first set
 * holding the fewest reps, until every set reaches the top of the range.
 * Targets run from most reps to fewest, the way sets go as you tire.
 *
 * With (3 sets, 5–6) this yields 5/5/5 → 6/5/5 → 6/6/5 → 6/6/6, and with
 * (2 sets, 8–10) it yields 8/8 → 9/8 → 9/9 → 10/9 → 10/10.
 */

export interface StaircaseStep {
  reps: number[]
  /** Every set is already at or above the maximum; the next step is a heavier load. */
  topReached: boolean
}

export function bottomRung(sets: number, minReps: number): number[] {
  return Array.from({ length: sets }, () => minReps)
}

export function isTopRung(reps: readonly number[], maxReps: number): boolean {
  return reps.every((r) => r >= maxReps)
}

export function incrementStaircase(reps: readonly number[], _minReps: number, maxReps: number): StaircaseStep {
  if (reps.length === 0 || isTopRung(reps, maxReps)) {
    return { reps: [...reps], topReached: true }
  }
  const lowest = Math.min(...reps)
  const index = reps.indexOf(lowest)
  const next = [...reps]
  next[index] = lowest + 1
  return { reps: next, topReached: false }
}

/** Sets ranked from most reps to fewest: 6/7/5 becomes 7/6/5. */
export function ranked(reps: readonly number[]): number[] {
  return [...reps].sort((a, b) => b - a)
}

/**
 * Whether the reps done meet a target, with both ranked from most reps to
 * fewest, so it doesn't matter which set came out best: 6/6/5 meets 5/5/6.
 */
export function meetsTarget(done: readonly number[], target: readonly number[]): boolean {
  const best = ranked(done)
  return best.length >= target.length && ranked(target).every((reps, i) => best[i] >= reps)
}

export function buildLadder(sets: number, minReps: number, maxReps: number): number[][] {
  const ladder = [bottomRung(sets, minReps)]
  let current = ladder[0]
  // Bounded by sets × range width; guards against a bad range looping forever.
  for (let guard = 0; guard <= sets * Math.max(0, maxReps - minReps); guard++) {
    const step = incrementStaircase(current, minReps, maxReps)
    if (step.topReached) break
    current = step.reps
    ladder.push(current)
  }
  return ladder
}

export function rungIndex(reps: readonly number[], ladder: readonly number[][]): number {
  return ladder.findIndex((rung) => rung.length === reps.length && rung.every((r, i) => r === reps[i]))
}
