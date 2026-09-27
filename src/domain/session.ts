import { evaluateExercise } from './progression/evaluate'
import { evaluateWarmup, isProgressiveStep } from './progression/warmup'
import { baselineFor, type ResolvedPrescription } from './prescription'
import type {
  ActualEffort,
  CarryExerciseLog,
  ExerciseDef,
  ExerciseLog,
  PlannedEffort,
  Prescription,
  Recommendation,
  RepsExerciseLog,
  SessionRuntime,
  SessionSource,
  Side,
  WarmupStepLog,
  WorkoutSession,
  WorkoutTemplate,
} from './types'

/** An active workout untouched for longer than this is offered Resume / Finish / Discard. */
export const STALE_AFTER_MS = 4 * 60 * 60 * 1000

export class SessionStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SessionStateError'
  }
}

/** Current targets keyed by exercise or warm-up step id, resolved or plain. */
export type PrescriptionLookup = ReadonlyMap<string, Prescription | ResolvedPrescription>

function lookup(prescriptions: PrescriptionLookup, id: string): Prescription | undefined {
  const value = prescriptions.get(id)
  if (!value) return undefined
  return 'prescription' in value ? value.prescription : value
}

function buildExerciseLog(exercise: ExerciseDef, prescription: Prescription | undefined): ExerciseLog {
  const base = {
    exerciseId: exercise.id,
    name: exercise.name,
    shortName: exercise.shortName,
    loadType: exercise.loadType,
    loadStepKg: exercise.loadStepKg,
    perSide: exercise.perSide,
    restSec: exercise.restSec,
  }
  if (exercise.kind === 'reps') {
    const target = prescription?.kind === 'reps' ? prescription : exercise.baseline
    const log: RepsExerciseLog = {
      ...base,
      kind: 'reps',
      scheme: structuredClone(exercise.scheme),
      planned: { loadKg: target.loadKg, sets: target.reps.map((reps) => ({ reps })) },
      actual: target.reps.map((reps) => ({ reps, loadKg: target.loadKg, status: 'pending' })),
    }
    return log
  }
  const target = prescription?.kind === 'timed' ? prescription : exercise.baseline
  const efforts: PlannedEffort[] = []
  for (let setIndex = 0; setIndex < exercise.scheme.setsPerSide; setIndex++) {
    for (const side of ['L', 'R'] as Side[]) efforts.push({ side, setIndex, seconds: target.seconds })
  }
  const log: CarryExerciseLog = {
    ...base,
    kind: 'carry',
    scheme: structuredClone(exercise.scheme),
    mode: 'carry',
    planned: { loadKg: target.loadKg, seconds: target.seconds, efforts },
    actual: efforts.map(
      (e): ActualEffort => ({ side: e.side, setIndex: e.setIndex, seconds: e.seconds, loadKg: target.loadKg, status: 'pending' }),
    ),
  }
  return log
}

export interface BuildSessionInput {
  id: string
  now: number
  template: WorkoutTemplate
  prescriptions: PrescriptionLookup
  source?: SessionSource
}

/** Snapshots today's plan. Planned values are never written again after this. */
export function buildSession({ id, now, template, prescriptions, source = 'real' }: BuildSessionInput): WorkoutSession {
  const warmup: WarmupStepLog[] = template.warmup.map((step) => {
    const progressive = isProgressiveStep(step)
    const current = progressive ? lookup(prescriptions, step.id) : undefined
    const target = current?.kind === 'warmup' ? current : baselineFor(step)
    const durationSec = target.kind === 'warmup' ? target.durationSec : step.durationSec
    const active = target.kind === 'warmup' ? target.active : true
    return {
      stepId: step.id,
      name: step.name,
      ...(step.cue ? { cue: step.cue } : {}),
      plannedSec: progressive ? durationSec : step.durationSec,
      active,
      elapsedMs: 0,
      completed: false,
      skipped: false,
      ...(step.progression ? { progression: { ...step.progression } } : {}),
      ...(step.activation ? { activation: { ...step.activation } } : {}),
    }
  })
  const exercises = template.exercises.map((exercise) => buildExerciseLog(exercise, lookup(prescriptions, exercise.id)))
  const hasWarmup = warmup.some((step) => step.active)

  return {
    id,
    status: 'active',
    source,
    ...(source === 'real' ? { activeSlot: 'active' as const } : {}),
    rev: 1,
    startedAt: now,
    lastInteractionAt: now,
    createdAt: now,
    updatedAt: now,
    warmup,
    exercises,
    exerciseIds: exercises.map((e) => e.exerciseId),
    runtime: {
      phase: hasWarmup ? 'warmup' : 'strength',
      currentExerciseId: exercises[0]?.exerciseId ?? '',
      warmup: { index: firstActiveWarmupIndex(warmup), timer: null, getReady: null },
      rest: null,
      effort: null,
    },
  }
}

export function firstActiveWarmupIndex(warmup: readonly WarmupStepLog[]): number {
  return Math.max(0, warmup.findIndex((s) => s.active))
}

export function isStale(session: WorkoutSession, now: number): boolean {
  return session.status === 'active' && now - session.lastInteractionAt > STALE_AFTER_MS
}

/** True once any warm-up time or any set or effort has been recorded. */
export function isLogged(session: WorkoutSession): boolean {
  return (
    session.warmup.some((step) => step.elapsedMs > 0 || step.completed) ||
    session.exercises.some((exercise) => exercise.actual.some((set) => set.status === 'done'))
  )
}

export interface PendingExercise {
  exerciseId: string
  name: string
  pending: number
}

export function pendingExercises(session: WorkoutSession): PendingExercise[] {
  return session.exercises
    .map((exercise) => ({
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      pending: exercise.actual.filter((set) => set.status === 'pending').length,
    }))
    .filter((entry) => entry.pending > 0)
}

export type PendingResolution = 'done' | 'skipped'

/** Resolves still-pending sets per exercise: done as prescribed, or skipped. */
export function resolvePending(
  session: WorkoutSession,
  resolutions: Record<string, PendingResolution>,
): WorkoutSession {
  const exercises = session.exercises.map((exercise): ExerciseLog => {
    const resolution = resolutions[exercise.exerciseId]
    if (!resolution) return exercise
    if (exercise.kind === 'reps') {
      return {
        ...exercise,
        actual: exercise.actual.map((set, i) =>
          set.status !== 'pending'
            ? set
            : { ...set, status: resolution, reps: resolution === 'done' ? (exercise.planned.sets[i]?.reps ?? set.reps) : set.reps },
        ),
      }
    }
    return {
      ...exercise,
      actual: exercise.actual.map((effort, i) =>
        effort.status !== 'pending'
          ? effort
          : {
              ...effort,
              status: resolution,
              seconds: resolution === 'done' ? (exercise.planned.efforts[i]?.seconds ?? effort.seconds) : effort.seconds,
            },
      ),
    }
  })
  return { ...session, exercises }
}

export function computeRecommendations(session: WorkoutSession): Record<string, Recommendation> {
  const recommendations: Record<string, Recommendation> = { ...evaluateWarmup(session.warmup) }
  for (const exercise of session.exercises) recommendations[exercise.exerciseId] = evaluateExercise(exercise)
  return recommendations
}

export interface FinishOptions {
  now: number
  /** Stamp the last interaction instead of now (a workout left open for hours). */
  stale?: boolean
}

/**
 * Evaluates the workout and marks it completed. Only an active session can be
 * finished. A reopened workout keeps its original finish time.
 */
export function finishSession(session: WorkoutSession, { now, stale = false }: FinishOptions): WorkoutSession {
  if (session.status !== 'active') throw new SessionStateError('Only an active workout can be finished')
  const finishedAt = session.reopenSnapshot?.finishedAt ?? (stale ? session.lastInteractionAt : now)
  const next: WorkoutSession = {
    ...session,
    status: 'completed',
    finishedAt,
    recommendations: computeRecommendations(session),
    rev: session.rev + 1,
    updatedAt: now,
  }
  delete next.activeSlot
  delete next.runtime
  delete next.reopenSnapshot
  return next
}

/** Reopens a finished workout for corrections, keeping the finished version to restore. */
export function reopenSession(session: WorkoutSession, now: number): WorkoutSession {
  if (session.status !== 'completed') throw new SessionStateError('Only a finished workout can be reopened')
  const snapshot: Omit<WorkoutSession, 'reopenSnapshot'> = structuredClone(session)
  const lastExercise = session.exercises.at(-1)
  const runtime: SessionRuntime = {
    phase: 'strength',
    currentExerciseId: lastExercise?.exerciseId ?? '',
    warmup: { index: firstActiveWarmupIndex(session.warmup), timer: null, getReady: null },
    rest: null,
    effort: null,
  }
  return {
    ...session,
    status: 'active',
    activeSlot: 'active',
    runtime,
    reopenSnapshot: snapshot,
    rev: session.rev + 1,
    updatedAt: now,
    lastInteractionAt: now,
  }
}

/** Restores the finished version of a reopened workout. */
export function cancelEdits(session: WorkoutSession, now: number): WorkoutSession {
  if (session.status !== 'active' || !session.reopenSnapshot) {
    throw new SessionStateError('Only a reopened workout can cancel its edits')
  }
  return { ...structuredClone(session.reopenSnapshot), rev: session.rev + 1, updatedAt: now }
}

/** Discards an accidental or abandoned workout. Never applies to a reopened one. */
export function discardSession(session: WorkoutSession, now: number): WorkoutSession {
  if (session.status !== 'active') throw new SessionStateError('Only an active workout can be discarded')
  if (session.reopenSnapshot) throw new SessionStateError('A reopened workout can only cancel its edits')
  const next: WorkoutSession = { ...session, status: 'discarded', rev: session.rev + 1, updatedAt: now }
  delete next.activeSlot
  delete next.runtime
  return next
}

export function softDeleteSession(session: WorkoutSession, now: number): WorkoutSession {
  return { ...session, deletedAt: now, rev: session.rev + 1, updatedAt: now }
}

/** Planned values as a comparable string; saves may never change them. */
export function plannedFingerprint(session: WorkoutSession): string {
  return JSON.stringify({
    warmup: session.warmup.map((s) => [s.stepId, s.plannedSec, s.active]),
    exercises: session.exercises.map((e) => [e.exerciseId, e.planned]),
  })
}
