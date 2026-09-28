import { describe, expect, it } from 'vitest'
import { warmupLog } from '../testing'
import { evaluateWarmup, warmupStepStatus } from './warmup'

const ropeProgression = { stepSec: 10, maxSec: 300 }
const duProgression = { stepSec: 5, maxSec: 60 }
const duActivation = { afterStepId: 'jump-rope', whenDurationReachesSec: 300 }

function rope(plannedSec: number, opts: Partial<Parameters<typeof warmupLog>[0]> = {}) {
  return warmupLog({ stepId: 'jump-rope', plannedSec, progression: ropeProgression, ...opts })
}

function doubleUnders(plannedSec: number, opts: Partial<Parameters<typeof warmupLog>[0]> = {}) {
  return warmupLog({
    stepId: 'double-unders',
    plannedSec,
    progression: duProgression,
    activation: duActivation,
    ...opts,
  })
}

describe('evaluateWarmup', () => {
  it('adds 10 s to jump rope after a full-duration completion', () => {
    const recs = evaluateWarmup([rope(120, { completed: true })])
    expect(recs['jump-rope']).toMatchObject({
      outcome: 'advance',
      prescription: { kind: 'warmup', durationSec: 130, active: true },
    })
  })

  it('repeats jump rope when it ended early', () => {
    const recs = evaluateWarmup([rope(120, { elapsedSec: 100 })])
    expect(recs['jump-rope']).toMatchObject({ outcome: 'repeat', prescription: { durationSec: 120 } })
  })

  it('repeats jump rope when it was skipped', () => {
    const recs = evaluateWarmup([rope(120, { skipped: true })])
    expect(recs['jump-rope']).toMatchObject({ outcome: 'repeat', prescription: { durationSec: 120 } })
  })

  it('clamps jump rope to its 5:00 cap', () => {
    const recs = evaluateWarmup([rope(295, { completed: true })])
    expect(recs['jump-rope']).toMatchObject({ outcome: 'advance', prescription: { durationSec: 300 } })
  })

  it('holds jump rope at 5:00 and activates double unders at 0:30', () => {
    const recs = evaluateWarmup([
      rope(300, { completed: true }),
      doubleUnders(30, { active: false }),
    ])
    expect(recs['jump-rope']).toMatchObject({ outcome: 'hold', prescription: { durationSec: 300 } })
    expect(recs['double-unders']).toMatchObject({
      outcome: 'activate',
      prescription: { kind: 'warmup', durationSec: 30, active: true },
    })
  })

  it('keeps double unders inactive until jump rope completes at 5:00', () => {
    const early = evaluateWarmup([rope(290, { completed: true }), doubleUnders(30, { active: false })])
    expect(early['double-unders']).toMatchObject({ outcome: 'inactive', prescription: { active: false } })

    const partial = evaluateWarmup([rope(300, { elapsedSec: 250 }), doubleUnders(30, { active: false })])
    expect(partial['double-unders']).toMatchObject({ outcome: 'inactive', prescription: { active: false } })
  })

  it('progresses active double unders by 5 s up to 1:00', () => {
    const grow = evaluateWarmup([rope(300, { completed: true }), doubleUnders(30, { completed: true })])
    expect(grow['double-unders']).toMatchObject({ outcome: 'advance', prescription: { durationSec: 35 } })

    const capped = evaluateWarmup([rope(300, { completed: true }), doubleUnders(60, { completed: true })])
    expect(capped['double-unders']).toMatchObject({ outcome: 'hold', prescription: { durationSec: 60 } })
  })

  it('gives non-progressive steps no recommendation', () => {
    const recs = evaluateWarmup([warmupLog({ stepId: 'shoulder-cars', plannedSec: 45, completed: true })])
    expect(recs['shoulder-cars']).toBeUndefined()
  })

  it('counts a sticky completion even after a partial redo', () => {
    const recs = evaluateWarmup([rope(120, { completed: true, elapsedSec: 30 })])
    expect(recs['jump-rope']).toMatchObject({ outcome: 'advance', prescription: { durationSec: 130 } })
  })
})

describe('warmupStepStatus', () => {
  it('derives status from time spent', () => {
    expect(warmupStepStatus(rope(120))).toBe('untouched')
    expect(warmupStepStatus(rope(120, { elapsedSec: 40 }))).toBe('partial')
    expect(warmupStepStatus(rope(120, { completed: true }))).toBe('complete')
    expect(warmupStepStatus(rope(120, { skipped: true }))).toBe('skipped')
    expect(warmupStepStatus(rope(120, { skipped: true, completed: true }))).toBe('complete')
  })
})
