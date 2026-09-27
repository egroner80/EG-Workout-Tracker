import type { Recommendation, WarmupStepLog, WarmupStepStatus } from '../types'
import { advanceTimed } from './timed'

export function warmupStepStatus(step: WarmupStepLog): WarmupStepStatus {
  if (step.completed) return 'complete'
  if (step.skipped) return 'skipped'
  return step.elapsedMs > 0 ? 'partial' : 'untouched'
}

/** A step is part of progression when it grows over time or unlocks later. */
export function isProgressiveStep(step: Pick<WarmupStepLog, 'progression' | 'activation'>): boolean {
  return Boolean(step.progression || step.activation)
}

/**
 * Recommendations for progressive warm-up steps. A step grows only when it
 * ran its full duration (completion is sticky through a redo); a step with an
 * activation rule joins once its trigger step completed at the threshold.
 */
export function evaluateWarmup(steps: readonly WarmupStepLog[]): Record<string, Recommendation> {
  const recommendations: Record<string, Recommendation> = {}
  const byId = new Map(steps.map((step) => [step.stepId, step]))

  for (const step of steps) {
    if (!isProgressiveStep(step)) continue

    if (!step.active) {
      const trigger = step.activation ? byId.get(step.activation.afterStepId) : undefined
      const unlocked =
        trigger !== undefined &&
        trigger.active &&
        trigger.completed &&
        trigger.plannedSec >= (step.activation?.whenDurationReachesSec ?? Infinity)
      recommendations[step.stepId] = {
        targetId: step.stepId,
        outcome: unlocked ? 'activate' : 'inactive',
        prescription: { kind: 'warmup', durationSec: step.plannedSec, active: unlocked },
      }
      continue
    }

    if (!step.completed || !step.progression) {
      recommendations[step.stepId] = {
        targetId: step.stepId,
        outcome: 'repeat',
        prescription: { kind: 'warmup', durationSec: step.plannedSec, active: true },
      }
      continue
    }

    const next = advanceTimed(step.plannedSec, step.progression)
    recommendations[step.stepId] = {
      targetId: step.stepId,
      outcome: next.topReached ? 'hold' : 'advance',
      prescription: { kind: 'warmup', durationSec: next.seconds, active: true },
    }
  }

  return recommendations
}
