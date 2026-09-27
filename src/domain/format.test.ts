import { describe, expect, it } from 'vitest'
import {
  formatActualCarry,
  formatActualSets,
  formatDuration,
  formatKg,
  formatLoad,
  formatNext,
  formatPrescription,
  formatReps,
} from './format'
import type { Recommendation } from './types'

describe('formatKg and formatLoad', () => {
  it('trims trailing zeros', () => {
    expect(formatKg(18)).toBe('18')
    expect(formatKg(2.5)).toBe('2.5')
  })

  it('formats every load type', () => {
    expect(formatLoad('dumbbell', 18)).toBe('18 kg')
    expect(formatLoad('weight', 10)).toBe('10 kg')
    expect(formatLoad('bodyweight', 0)).toBe('BW')
    expect(formatLoad('bodyweight', 5)).toBe('BW + 5 kg')
    expect(formatLoad('bodyweight', -10)).toBe('Assisted −10 kg')
    expect(formatLoad('bodyweight', 2.5)).toBe('BW + 2.5 kg')
  })
})

describe('formatReps', () => {
  it('joins with an em dash on cards and a slash in summaries', () => {
    expect(formatReps([5, 5, 6])).toBe('5 — 5 — 6')
    expect(formatReps([5, 5, 6], ' / ')).toBe('5 / 5 / 6')
  })

  it('renders missing reps as a dash', () => {
    expect(formatReps([5, null, 6], ' / ')).toBe('5 / – / 6')
  })
})

describe('formatDuration', () => {
  it('formats m:ss', () => {
    expect(formatDuration(120)).toBe('2:00')
    expect(formatDuration(45)).toBe('0:45')
    expect(formatDuration(305)).toBe('5:05')
  })
})

describe('formatActualSets', () => {
  it('shows one load when every set shares it', () => {
    expect(
      formatActualSets('dumbbell', [
        { reps: 5, loadKg: 16, status: 'done' },
        { reps: 5, loadKg: 16, status: 'done' },
        { reps: 5, loadKg: 16, status: 'done' },
      ]),
    ).toBe('16 kg · 5 / 5 / 5')
  })

  it('groups consecutive sets by load', () => {
    expect(
      formatActualSets('dumbbell', [
        { reps: 5, loadKg: 18, status: 'done' },
        { reps: 5, loadKg: 18, status: 'done' },
        { reps: 5, loadKg: 16, status: 'done' },
      ]),
    ).toBe('18 kg · 5 / 5 · 16 kg · 5')
  })

  it('renders skipped and pending sets as dashes without splitting the group', () => {
    expect(
      formatActualSets('bodyweight', [
        { reps: 6, loadKg: 0, status: 'done' },
        { reps: 6, loadKg: 0, status: 'skipped' },
        { reps: 5, loadKg: 0, status: 'done' },
      ]),
    ).toBe('BW · 6 / – / 5')
  })
})

describe('formatActualCarry', () => {
  it('shows both sides clearly', () => {
    expect(
      formatActualCarry('dumbbell', [
        { side: 'L', setIndex: 0, seconds: 40, loadKg: 18, status: 'done' },
        { side: 'R', setIndex: 0, seconds: 40, loadKg: 18, status: 'done' },
        { side: 'L', setIndex: 1, seconds: 40, loadKg: 18, status: 'done' },
        { side: 'R', setIndex: 1, seconds: 35, loadKg: 18, status: 'done' },
      ]),
    ).toBe('18 kg · L 40 / 40 s · R 40 / 35 s')
  })
})

describe('formatPrescription', () => {
  it('formats reps, timed, and warm-up prescriptions', () => {
    expect(formatPrescription({ kind: 'reps', loadKg: 0, reps: [5, 6, 6] }, 'bodyweight')).toBe('BW · 5 / 6 / 6')
    expect(formatPrescription({ kind: 'timed', loadKg: 18, seconds: 40, setsPerSide: 2 }, 'dumbbell')).toBe(
      '18 kg · 40 s per side × 2',
    )
    expect(formatPrescription({ kind: 'warmup', durationSec: 130, active: true })).toBe('2:10')
  })
})

describe('formatNext', () => {
  const rec = (partial: Omit<Recommendation, 'targetId'>): Recommendation => ({ targetId: 'x', ...partial })

  it('omits the load for a plain bodyweight advance', () => {
    expect(formatNext(rec({ outcome: 'advance', prescription: { kind: 'reps', loadKg: 0, reps: [5, 6, 6] } }), 'bodyweight')).toBe(
      '5 / 6 / 6',
    )
  })

  it('includes the load for weighted exercises', () => {
    expect(formatNext(rec({ outcome: 'advance', prescription: { kind: 'reps', loadKg: 18, reps: [6, 6, 6] } }), 'dumbbell')).toBe(
      '18 kg · 6 / 6 / 6',
    )
  })

  it('phrases repeats and not-performed as repeats', () => {
    expect(formatNext(rec({ outcome: 'repeat', prescription: { kind: 'reps', loadKg: 0, reps: [6, 6, 6] } }), 'bodyweight')).toBe(
      'Repeat 6 / 6 / 6',
    )
    expect(
      formatNext(rec({ outcome: 'not-performed', prescription: { kind: 'reps', loadKg: 18, reps: [5, 5, 5] } }), 'dumbbell'),
    ).toBe('Repeat 18 kg · 5 / 5 / 5')
  })

  it('names the heavier load on an increase', () => {
    expect(
      formatNext(rec({ outcome: 'increase-load', prescription: { kind: 'reps', loadKg: 20, reps: [5, 5, 5] } }), 'dumbbell'),
    ).toBe('20 kg · 5 / 5 / 5')
  })

  it('phrases timed and warm-up recommendations', () => {
    expect(
      formatNext(rec({ outcome: 'advance', prescription: { kind: 'timed', loadKg: 18, seconds: 45, setsPerSide: 2 } }), 'dumbbell'),
    ).toBe('18 kg · 45 s per side × 2')
    expect(formatNext(rec({ outcome: 'advance', prescription: { kind: 'warmup', durationSec: 130, active: true } }))).toBe('2:10')
    expect(formatNext(rec({ outcome: 'repeat', prescription: { kind: 'warmup', durationSec: 120, active: true } }))).toBe(
      'Repeat 2:00',
    )
    expect(formatNext(rec({ outcome: 'activate', prescription: { kind: 'warmup', durationSec: 30, active: true } }))).toBe(
      'Starts at 0:30',
    )
  })
})
