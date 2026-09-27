import type { ResolvedPrescription } from '../../domain/prescription'
import { isProgressiveStep } from '../../domain/progression/warmup'
import type { WorkoutTemplate } from '../../domain/types'

/** Warm-up steps active next time, with their durations. */
export function warmupPlan(template: WorkoutTemplate, targets: Map<string, ResolvedPrescription>) {
  return template.warmup
    .map((step) => {
      const target = isProgressiveStep(step) ? targets.get(step.id)?.prescription : undefined
      if (target?.kind === 'warmup') return { step, durationSec: target.durationSec, active: target.active }
      return { step, durationSec: step.durationSec, active: !step.activation }
    })
    .filter((entry) => entry.active)
}
