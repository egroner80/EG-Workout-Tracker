import { describe, expect, it } from 'vitest'
import { roundKg, stepLoad } from './load'

describe('roundKg', () => {
  it('removes floating-point drift', () => {
    expect(roundKg(0.1 + 0.2)).toBe(0.3)
    expect(roundKg(-10 + 2.5)).toBe(-7.5)
  })
})

describe('stepLoad', () => {
  it('steps dumbbells by the exercise step and never below one step', () => {
    expect(stepLoad('dumbbell', 18, 2, 1)).toBe(20)
    expect(stepLoad('dumbbell', 18, 2, -1)).toBe(16)
    expect(stepLoad('dumbbell', 2, 2, -1)).toBe(2)
  })

  it('moves bodyweight load through assisted, bodyweight, and added', () => {
    expect(stepLoad('bodyweight', 0, 2.5, 1)).toBe(2.5)
    expect(stepLoad('bodyweight', 0, 2.5, -1)).toBe(-2.5)
    expect(stepLoad('bodyweight', -2.5, 2.5, 1)).toBe(0)
  })

  it('clamps bodyweight assistance and added weight to sane bounds', () => {
    expect(stepLoad('bodyweight', -100, 2.5, -1)).toBe(-100)
    expect(stepLoad('bodyweight', 200, 2.5, 1)).toBe(200)
  })
})
