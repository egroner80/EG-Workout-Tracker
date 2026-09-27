import type { ExerciseLog, SetStatus } from '../../domain/types'

export function loadQualifier(log: Pick<ExerciseLog, 'loadType' | 'perSide'>): string {
  if (log.perSide) return 'per side'
  if (log.loadType === 'dumbbell') return 'per dumbbell'
  return ''
}

export type ChipState = 'pending' | 'done' | 'below' | 'skipped'

/** A set's reps, or a carry side's seconds, against its target. */
export function chipState(status: SetStatus, actual: number, target: number | undefined): ChipState {
  if (status === 'skipped') return 'skipped'
  if (status === 'pending') return 'pending'
  return target !== undefined && actual < target ? 'below' : 'done'
}

export function exerciseProgress(log: ExerciseLog): { logged: number; total: number } {
  return { logged: log.actual.filter((set) => set.status !== 'pending').length, total: log.actual.length }
}
