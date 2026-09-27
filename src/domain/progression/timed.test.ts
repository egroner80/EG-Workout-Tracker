import { describe, expect, it } from 'vitest'
import { advanceTimed } from './timed'

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
