import { describe, expect, it } from 'vitest'
import { bottomRung, buildLadder, incrementStaircase, rungIndex, rungReached } from './staircase'

describe('buildLadder', () => {
  it('reproduces the 5–6 ladder for three sets exactly', () => {
    expect(buildLadder(3, 5, 6)).toEqual([
      [5, 5, 5],
      [5, 5, 6],
      [5, 6, 6],
      [6, 6, 6],
    ])
  })

  it('reproduces the hammer curl 8–10 ladder for two sets exactly', () => {
    expect(buildLadder(2, 8, 10)).toEqual([
      [8, 8],
      [8, 9],
      [9, 9],
      [9, 10],
      [10, 10],
    ])
  })

  it('builds 16 rungs for three sets of 10–15', () => {
    const ladder = buildLadder(3, 10, 15)
    expect(ladder).toHaveLength(16)
    expect(ladder[0]).toEqual([10, 10, 10])
    expect(ladder.at(-1)).toEqual([15, 15, 15])
  })

  it('builds five rungs for four sets of 5–6', () => {
    expect(buildLadder(4, 5, 6)).toHaveLength(5)
  })

  it('returns a single rung when the range has no width', () => {
    expect(buildLadder(3, 8, 8)).toEqual([[8, 8, 8]])
  })
})

describe('incrementStaircase', () => {
  it('adds one rep to the rightmost set holding the fewest reps', () => {
    expect(incrementStaircase([5, 5, 5], 5, 6)).toEqual({ reps: [5, 5, 6], topReached: false })
    expect(incrementStaircase([5, 5, 6], 5, 6)).toEqual({ reps: [5, 6, 6], topReached: false })
    expect(incrementStaircase([5, 6, 6], 5, 6)).toEqual({ reps: [6, 6, 6], topReached: false })
  })

  it('handles off-ladder custom targets', () => {
    expect(incrementStaircase([6, 6, 5], 5, 6).reps).toEqual([6, 6, 6])
    expect(incrementStaircase([4, 4, 4], 5, 6).reps).toEqual([4, 4, 5])
  })

  it('reports the top once every set is at or above the maximum', () => {
    expect(incrementStaircase([6, 6, 6], 5, 6)).toEqual({ reps: [6, 6, 6], topReached: true })
    expect(incrementStaircase([7, 7, 7], 5, 6).topReached).toBe(true)
  })

  it('never mutates its input', () => {
    const reps = [5, 5, 5]
    incrementStaircase(reps, 5, 6)
    expect(reps).toEqual([5, 5, 5])
  })
})

describe('rungReached', () => {
  it('climbs from the planned rung to the highest rung every set reached', () => {
    expect(rungReached([5, 5, 5], [8, 8, 8], 5, 12)).toEqual([8, 8, 8])
    expect(rungReached([5, 5, 5], [9, 7, 6], 5, 12)).toEqual([6, 6, 6])
    expect(rungReached([8, 8], [9, 10], 8, 12)).toEqual([9, 10])
  })

  it('stays on the planned rung when the reps match it', () => {
    expect(rungReached([5, 6, 6], [5, 6, 6], 5, 12)).toEqual([5, 6, 6])
  })

  it('stops at the top of the range', () => {
    expect(rungReached([5, 5, 6], [9, 9, 9], 5, 6)).toEqual([6, 6, 6])
  })

  it('stays put when a set has no reps to compare', () => {
    expect(rungReached([5, 5, 5], [9, 9], 5, 12)).toEqual([5, 5, 5])
  })

  it('never mutates its input', () => {
    const planned = [5, 5, 5]
    rungReached(planned, [8, 8, 8], 5, 12)
    expect(planned).toEqual([5, 5, 5])
  })
})

describe('bottomRung and rungIndex', () => {
  it('returns the all-minimum rung', () => {
    expect(bottomRung(3, 5)).toEqual([5, 5, 5])
    expect(bottomRung(2, 8)).toEqual([8, 8])
  })

  it('finds a rung by value and returns -1 for off-ladder targets', () => {
    const ladder = buildLadder(3, 5, 6)
    expect(rungIndex([5, 6, 6], ladder)).toBe(2)
    expect(rungIndex([6, 5, 5], ladder)).toBe(-1)
  })
})
