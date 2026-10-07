import { roundKg } from '../load'
import type { CarryExerciseLog, ExerciseLog, Recommendation, RepsExerciseLog, WorkoutSession } from '../types'
import { bottomRung, incrementStaircase, meetsTarget, ranked } from './staircase'
import { advanceTimed, timeReached } from './timed'

/**
 * Judges an exercise by what was actually done. Sets are compared from most
 * reps to fewest, so it doesn't matter which one came out best:
 * - goal met → the next goal proceeds a rep;
 * - goal beaten → the next goal is a rep past what was actually done;
 *   either way at the lowest load actually used, up to the top of the range,
 *   and once every set reaches the top → load + step, back to the bottom;
 * - goal unmet (a set short, skipped, or lighter) → the same goal again.
 * Added sets count toward neither. Timed efforts work the same way, in steps
 * of time.
 */
export function evaluateExercise(log: ExerciseLog): Recommendation {
  return log.kind === 'reps' ? evaluateReps(log) : evaluateCarry(log)
}

/**
 * What a finished workout recommends for a target, judged by today's rules
 * from what was actually done, so a workout finished under earlier rules
 * still counts in full. Progressive warm-up steps keep the stored one.
 */
export function recommendationFor(session: WorkoutSession, targetId: string): Recommendation | undefined {
  const log = session.exercises.find((exercise) => exercise.exerciseId === targetId)
  return log ? evaluateExercise(log) : session.recommendations?.[targetId]
}

function evaluateReps(log: RepsExerciseLog): Recommendation {
  const { planned, scheme } = log
  const plannedReps = planned.sets.map((s) => s.reps)
  const repeat = (outcome: 'repeat' | 'not-performed'): Recommendation => ({
    targetId: log.exerciseId,
    outcome,
    prescription: { kind: 'reps', loadKg: planned.loadKg, reps: plannedReps },
  })

  const performed = log.actual.slice(0, planned.sets.length)
  if (!performed.some((set) => set.status === 'done')) return repeat('not-performed')

  const everySetDone = planned.sets.every((_, i) => {
    const set = performed[i]
    return set !== undefined && set.status === 'done' && set.loadKg >= planned.loadKg
  })
  const doneReps = performed.map((set) => set.reps)
  // A goal above the range (it was lowered since) counts as met at the top of the range.
  const goal = plannedReps.map((reps) => Math.min(reps, scheme.maxReps))
  if (!everySetDone || !meetsTarget(doneReps, goal)) return repeat('repeat')

  const workingLoad = Math.min(...performed.map((set) => set.loadKg))
  const achieved = ranked(doneReps).map((reps) => Math.min(reps, scheme.maxReps))
  const step = incrementStaircase(achieved, scheme.minReps, scheme.maxReps)
  if (step.topReached) {
    return {
      targetId: log.exerciseId,
      outcome: 'increase-load',
      prescription: {
        kind: 'reps',
        loadKg: roundKg(workingLoad + log.loadStepKg),
        reps: bottomRung(plannedReps.length, scheme.minReps),
      },
      ...(log.loadType === 'bodyweight' ? { chooseResistance: true } : {}),
    }
  }
  return {
    targetId: log.exerciseId,
    outcome: 'advance',
    prescription: { kind: 'reps', loadKg: workingLoad, reps: step.reps },
  }
}

function evaluateCarry(log: CarryExerciseLog): Recommendation {
  const { planned, scheme } = log
  const setsPerSide = scheme.setsPerSide
  const repeat = (outcome: 'repeat' | 'not-performed'): Recommendation => ({
    targetId: log.exerciseId,
    outcome,
    prescription: { kind: 'timed', loadKg: planned.loadKg, seconds: planned.seconds, setsPerSide },
  })

  const performed = log.actual.slice(0, planned.efforts.length)
  if (!performed.some((effort) => effort.status === 'done')) return repeat('not-performed')

  const success = planned.efforts.every((target, i) => {
    const effort = performed[i]
    return (
      effort !== undefined &&
      effort.status === 'done' &&
      effort.seconds >= target.seconds &&
      effort.loadKg >= planned.loadKg
    )
  })
  if (!success) return repeat('repeat')

  const workingLoad = Math.min(...performed.map((effort) => effort.loadKg))
  const reached = timeReached(planned.seconds, performed.map((effort) => effort.seconds), scheme)
  const step = advanceTimed(reached, scheme)
  if (step.topReached) {
    return {
      targetId: log.exerciseId,
      outcome: 'increase-load',
      prescription: {
        kind: 'timed',
        loadKg: roundKg(workingLoad + log.loadStepKg),
        seconds: scheme.minSec,
        setsPerSide,
      },
      ...(log.loadType === 'bodyweight' ? { chooseResistance: true } : {}),
    }
  }
  return {
    targetId: log.exerciseId,
    outcome: 'advance',
    prescription: { kind: 'timed', loadKg: workingLoad, seconds: step.seconds, setsPerSide },
  }
}
