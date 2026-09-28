import { saveSettings } from '../../data/repositories/settingsRepo'
import { modifyTemplate } from '../../data/repositories/templateRepo'
import type { AppSettings, ExerciseDef, TemplateId, WarmupStepDef, WorkoutTemplate } from '../../domain/types'
import { useWorkoutStore } from '../../state/workoutStore'

/** Settings apply immediately (the store reads them live) and persist. */
export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  const settings = { ...useWorkoutStore.getState().settings, ...patch, updatedAt: Date.now() }
  useWorkoutStore.getState().setSettings(settings)
  await saveSettings(settings)
}

/**
 * Template edits apply from the next workout; the active one keeps its
 * snapshot. Warm-up steps both workouts share change in both.
 */
export async function updateTemplate(
  templateId: TemplateId,
  recipe: (template: WorkoutTemplate) => WorkoutTemplate,
): Promise<void> {
  await modifyTemplate(templateId, recipe, Date.now())
}

export function updateWarmupStep(
  templateId: TemplateId,
  id: string,
  recipe: (step: WarmupStepDef) => WarmupStepDef,
): Promise<void> {
  return updateTemplate(templateId, (t) => ({ ...t, warmup: t.warmup.map((s) => (s.id === id ? recipe(s) : s)) }))
}

export function updateExercise(
  templateId: TemplateId,
  id: string,
  recipe: (exercise: ExerciseDef) => ExerciseDef,
): Promise<void> {
  return updateTemplate(templateId, (t) => ({ ...t, exercises: t.exercises.map((e) => (e.id === id ? recipe(e) : e)) }))
}

/** Moves the item with `id` one place up or down; a no-op at either end. */
export function moveById<T extends { id: string }>(items: readonly T[], id: string, direction: -1 | 1): T[] {
  const index = items.findIndex((item) => item.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= items.length) return [...items]
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
