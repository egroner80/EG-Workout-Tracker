import type { TemplateId, WorkoutSession } from './types'

/** Both workouts, in the order they are listed. */
export const TEMPLATE_IDS: readonly TemplateId[] = ['upper', 'lower']

const LABELS: Record<TemplateId, string> = { upper: 'Upper body', lower: 'Lower body' }

export function isTemplateId(value: unknown): value is TemplateId {
  return value === 'upper' || value === 'lower'
}

export function templateLabel(id: TemplateId): string {
  return LABELS[id]
}

export function otherTemplate(id: TemplateId): TemplateId {
  return id === 'upper' ? 'lower' : 'upper'
}

/** Workouts saved before the lower-body workout existed carry no type: they were upper body. */
export function workoutTypeOf(session: Pick<WorkoutSession, 'templateId'>): TemplateId {
  return session.templateId ?? 'upper'
}
