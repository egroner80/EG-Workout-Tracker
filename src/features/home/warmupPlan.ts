import type { ResolvedPrescription } from '../../domain/prescription'
import { isProgressiveStep } from '../../domain/progression/warmup'
import type { WarmupStepDef, WorkoutTemplate } from '../../domain/types'

/** Warm-up steps active next time, with their durations and the time each takes. */
export function warmupPlan(template: WorkoutTemplate, targets: Map<string, ResolvedPrescription>) {
  return template.warmup
    .map((step) => {
      const target = isProgressiveStep(step) ? targets.get(step.id)?.prescription : undefined
      if (target?.kind === 'warmup') return planned(step, target.durationSec, target.active)
      return planned(step, step.durationSec, !step.activation)
    })
    .filter((entry) => entry.active)
}

/**
 * A per-side duration is timed once per side; a rep step's duration already
 * estimates the whole step, both sides included.
 */
function planned(step: WarmupStepDef, durationSec: number, active: boolean) {
  const totalSec = step.perSide && step.reps === undefined ? durationSec * 2 : durationSec
  return { step, durationSec, totalSec, active }
}
