import { bottomRung } from './progression/staircase'
import { isProgressiveStep } from './progression/warmup'
import type {
  ExerciseDef,
  ExerciseLog,
  Prescription,
  PrescriptionOverride,
  Recommendation,
  WarmupStepDef,
  WorkoutSession,
  WorkoutTemplate,
} from './types'

export type PrescriptionSource = 'baseline' | 'recommendation' | 'override'

export interface ResolvedPrescription {
  targetId: string
  prescription: Prescription
  source: PrescriptionSource
  /** The finished session the recommendation came from, if any. */
  sessionId?: string
  recommendation?: Recommendation
  override?: PrescriptionOverride
}

/** A finished, not deleted, real workout: the only kind that feeds targets and LAST TIME. */
export function isRealSession(session: WorkoutSession): boolean {
  return session.status === 'completed' && session.source === 'real' && session.deletedAt === undefined
}

/** Completed, non-deleted, real sessions, newest first by (original) finish time. */
export function realHistory(sessions: readonly WorkoutSession[]): WorkoutSession[] {
  return sessions.filter(isRealSession).sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
}

export function baselineFor(target: ExerciseDef | WarmupStepDef): Prescription {
  if ('kind' in target) return structuredClone(target.baseline)
  return { kind: 'warmup', durationSec: target.durationSec, active: !target.activation }
}

/**
 * Keeps a prescription consistent with the exercise's current scheme: a
 * changed set count, or a recommendation produced under a different rep
 * range, restarts at the bottom rung at the same load.
 */
export function normalizePrescription(
  prescription: Prescription,
  exercise: ExerciseDef,
  producedUnder?: ExerciseLog,
): Prescription {
  if (exercise.kind === 'reps' && prescription.kind === 'reps') {
    const { sets, minReps, maxReps } = exercise.scheme
    const rangeChanged =
      producedUnder?.kind === 'reps' &&
      (producedUnder.scheme.minReps !== minReps || producedUnder.scheme.maxReps !== maxReps)
    if (prescription.reps.length !== sets || rangeChanged) {
      return { kind: 'reps', loadKg: prescription.loadKg, reps: bottomRung(sets, minReps) }
    }
    return prescription
  }
  if (exercise.kind === 'carry' && prescription.kind === 'timed') {
    return { ...prescription, setsPerSide: exercise.scheme.setsPerSide }
  }
  // Kind mismatch (an exercise changed type): start over from the baseline.
  return baselineFor(exercise)
}

interface DeriveInput {
  template: WorkoutTemplate
  sessions: readonly WorkoutSession[]
  overrides: readonly PrescriptionOverride[]
}

/**
 * Current targets for every exercise and progressive warm-up step.
 *
 * The latest finished real session carrying a recommendation for the target
 * wins, unless the newest override for it was created after that session
 * finished (or no session carries the target yet). Reopening keeps the
 * original finish time, so overrides made on the summary survive a reopen;
 * deleting a workout keeps later overrides in force automatically.
 */
export function deriveCurrentPrescriptions(input: DeriveInput): Map<string, ResolvedPrescription> {
  const history = realHistory(input.sessions)
  const newestOverride = new Map<string, PrescriptionOverride>()
  for (const override of input.overrides) {
    const current = newestOverride.get(override.targetId)
    if (!current || override.createdAt > current.createdAt) newestOverride.set(override.targetId, override)
  }

  const targets: (ExerciseDef | WarmupStepDef)[] = [
    ...input.template.exercises,
    ...input.template.warmup.filter(isProgressiveStep),
  ]
  const result = new Map<string, ResolvedPrescription>()

  for (const target of targets) {
    const session = history.find((s) => s.recommendations?.[target.id] !== undefined)
    const recommendation = session?.recommendations?.[target.id]
    const override = newestOverride.get(target.id)
    // Overrides cannot be created during a workout, so one stamped at or after
    // the session's finish always follows it.
    const overrideWins = override !== undefined && (!session || override.createdAt >= (session.finishedAt ?? 0))

    let resolved: ResolvedPrescription
    if (overrideWins) {
      resolved = { targetId: target.id, prescription: override.prescription, source: 'override', override }
      if (session) resolved.sessionId = session.id
      if (recommendation) resolved.recommendation = recommendation
    } else if (session && recommendation) {
      resolved = {
        targetId: target.id,
        prescription: recommendation.prescription,
        source: 'recommendation',
        sessionId: session.id,
        recommendation,
      }
    } else {
      resolved = { targetId: target.id, prescription: baselineFor(target), source: 'baseline' }
    }

    if ('kind' in target) {
      const producedUnder =
        resolved.source === 'recommendation' ? session?.exercises.find((e) => e.exerciseId === target.id) : undefined
      resolved.prescription = normalizePrescription(resolved.prescription, target, producedUnder)
    }
    result.set(target.id, resolved)
  }
  return result
}

export interface LastTime {
  session: WorkoutSession
  log: ExerciseLog
}

/**
 * The most recent real workout, started before `beforeStartedAt`, in which
 * the exercise had at least one done set or effort.
 */
export function findLastTime(
  exerciseId: string,
  sessions: readonly WorkoutSession[],
  beforeStartedAt = Number.POSITIVE_INFINITY,
): LastTime | undefined {
  for (const session of realHistory(sessions)) {
    if (session.startedAt >= beforeStartedAt) continue
    const log = session.exercises.find((e) => e.exerciseId === exerciseId)
    if (log && log.actual.some((set) => set.status === 'done')) return { session, log }
  }
  return undefined
}
