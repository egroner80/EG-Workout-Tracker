import { describe, expect, it } from 'vitest'
import { advanceTimed, timeReached } from './timed'

const carry = { minSec: 40, maxSec: 60, stepSec: 5 }

describe('advanceTimed', () => {
  it('adds the step below the cap', () => {
    expect(advanceTimed(40, carry)).toEqual({ seconds: 45, topReached: false })
  })

  it('clamps to the cap', () => {
    expect(advanceTimed(58, carry)).toEqual({ seconds: 60, topReached: false })
  })

  it('reports the top when already at the cap', () => {
    expect(advanceTimed(60, carry)).toEqual({ seconds: 60, topReached: true })
  })
})

describe('timeReached', () => {
  it('counts whole steps up to the shortest effort', () => {
    expect(timeReached(40, [50, 55, 50, 52], carry)).toBe(50)
    expect(timeReached(40, [44, 60, 60, 60], carry)).toBe(40)
  })

  it('stops at the cap', () => {
    expect(timeReached(45, [75, 80, 75, 90], carry)).toBe(60)
  })

  it('keeps a planned time already past the cap', () => {
    expect(timeReached(65, [70, 70, 70, 70], carry)).toBe(65)
  })
})
