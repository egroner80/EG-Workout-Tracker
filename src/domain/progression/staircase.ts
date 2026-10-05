/**
 * The staircase progression: each success adds one rep to the rightmost set
 * holding the fewest reps, until every set reaches the top of the range.
 *
 * With (3 sets, 5–6) this yields 5/5/5 → 5/5/6 → 5/6/6 → 6/6/6, and with
 * (2 sets, 8–10) it yields 8/8 → 8/9 → 9/9 → 9/10 → 10/10.
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
  const index = reps.lastIndexOf(lowest)
  const next = [...reps]
  next[index] = lowest + 1
  return { reps: next, topReached: false }
}

/**
 * The highest rung the reps actually done reach: climbs from the planned
 * target while every set still meets the next rung, and stops at the top.
 * Planned 5/5/5 done as 8/8/8 reaches 8/8/8; done as 9/7/6 it reaches 6/6/6,
 * because a rung counts only when every set reaches it.
 */
export function rungReached(planned: readonly number[], done: readonly number[], minReps: number, maxReps: number): number[] {
  let reached = [...planned]
  for (;;) {
    const step = incrementStaircase(reached, minReps, maxReps)
    if (step.topReached || !step.reps.every((reps, i) => reps <= done[i])) return reached
    reached = step.reps
  }
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
