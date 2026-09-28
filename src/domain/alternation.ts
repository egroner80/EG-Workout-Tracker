import type { TemplateId, WorkoutSession } from './types'
import { otherTemplate, workoutTypeOf } from './workouts'

/**
 * The workout to suggest next, so upper and lower body alternate: the other
 * one than the workout in progress (a finished workout reopened for edits
 * counts), otherwise than the newest finished workout, otherwise upper body.
 * `recent` is newest first and holds finished real workouts only; demo,
 * discarded and deleted workouts never count. The suggestion is advice:
 * either workout can still be started.
 */
export function nextTemplateId(active: WorkoutSession | null, recent: readonly { templateId: TemplateId }[]): TemplateId {
  if (active) return otherTemplate(workoutTypeOf(active))
  const newest = recent[0]
  return newest ? otherTemplate(newest.templateId) : 'upper'
}
