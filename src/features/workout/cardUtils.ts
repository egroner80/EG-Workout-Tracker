import type { ActualSet, ExerciseLog } from '../../domain/types'

export function loadQualifier(log: { loadType: string; perSide: boolean }): string {
  if (log.perSide) return 'per side'
  if (log.loadType === 'dumbbell') return 'per dumbbell'
  return ''
}

export type ChipState = 'pending' | 'done' | 'below' | 'skipped'

export function chipState(set: ActualSet, targetReps: number | undefined): ChipState {
  if (set.status === 'skipped') return 'skipped'
  if (set.status === 'pending') return 'pending'
  return targetReps !== undefined && set.reps < targetReps ? 'below' : 'done'
}

export function exerciseProgress(log: ExerciseLog): { logged: number; total: number } {
  return { logged: log.actual.filter((set) => set.status !== 'pending').length, total: log.actual.length }
}
