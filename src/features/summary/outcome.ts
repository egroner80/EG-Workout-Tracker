import type { Recommendation } from '../../domain/types'

/** A workout met its target when the engine advanced or raised the load. */
export function isSuccess(recommendation: Recommendation | undefined): boolean {
  return recommendation?.outcome === 'advance' || recommendation?.outcome === 'increase-load'
}
