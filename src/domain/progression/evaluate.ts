import { roundKg } from '../load'
import type { CarryExerciseLog, ExerciseLog, Recommendation, RepsExerciseLog } from '../types'
import { bottomRung, incrementStaircase } from './staircase'
import { advanceTimed } from './timed'

/**
 * Judges an exercise by what was actually done:
 * - every planned set done at ≥ planned load and ≥ planned reps → one rung up
 *   (at the lowest load actually used), or at the top rung → load + step and
 *   back to the bottom rung;
 * - anything short, skipped, or lighter → repeat the planned target exactly.
 * Added sets never count against success, and over-performance never skips rungs.
 */
export function evaluateExercise(log: ExerciseLog): Recommendation {
  return log.kind === 'reps' ? evaluateReps(log) : evaluateCarry(log)
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

  const success = planned.sets.every((target, i) => {
    const set = performed[i]
    return set !== undefined && set.status === 'done' && set.reps >= target.reps && set.loadKg >= planned.loadKg
  })
  if (!success) return repeat('repeat')

  const workingLoad = Math.min(...performed.map((set) => set.loadKg))
  const step = incrementStaircase(plannedReps, scheme.minReps, scheme.maxReps)
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
  const step = advanceTimed(planned.seconds, scheme)
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
    }
  }
  return {
    targetId: log.exerciseId,
    outcome: 'advance',
    prescription: { kind: 'timed', loadKg: workingLoad, seconds: step.seconds, setsPerSide },
  }
}
