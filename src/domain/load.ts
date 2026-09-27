import { clamp } from './math'
import type { LoadType } from './types'

const BODYWEIGHT_MIN_KG = -100
const BODYWEIGHT_MAX_KG = 200
const EXTERNAL_MAX_KG = 300

/** Rounds to 0.01 kg so repeated 2.5 kg steps never drift. */
export function roundKg(kg: number): number {
  return Math.round(kg * 100) / 100
}

/**
 * Moves a load one step up or down. Bodyweight loads pass smoothly through
 * assisted (negative), bodyweight (0), and added (positive) weight; external
 * loads never drop below a single step.
 */
export function stepLoad(loadType: LoadType, kg: number, stepKg: number, direction: 1 | -1): number {
  const next = roundKg(kg + direction * stepKg)
  if (loadType === 'bodyweight') {
    return clamp(next, BODYWEIGHT_MIN_KG, BODYWEIGHT_MAX_KG)
  }
  return clamp(next, stepKg, EXTERNAL_MAX_KG)
}
