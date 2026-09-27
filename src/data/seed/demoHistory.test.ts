import { describe, expect, it } from 'vitest'
import { createDefaultTemplate } from './defaultTemplate'
import { generateDemoHistory } from './demoHistory'

const NOW = Date.UTC(2026, 8, 27, 17, 0)
const DAY = 24 * 60 * 60 * 1000
const MAIN_LIFTS = ['pull-ups', 'dips', 'db-row', 'db-bench', 'db-press']

describe('generateDemoHistory', () => {
  const sessions = generateDemoHistory({ now: NOW, template: createDefaultTemplate() })

  it('is deterministic for a fixed date', () => {
    expect(generateDemoHistory({ now: NOW, template: createDefaultTemplate() })).toEqual(sessions)
  })

  it('spans about eight weeks and ends before today', () => {
    expect(sessions).toHaveLength(18)
    const first = sessions[0].startedAt
    const last = sessions.at(-1)?.finishedAt ?? 0
    expect(last).toBeLessThan(NOW)
    expect((last - first) / DAY).toBeGreaterThan(49)
    expect((last - first) / DAY).toBeLessThan(63)
  })

  it('marks every record as demo and finished', () => {
    expect(sessions.every((s) => s.source === 'demo' && s.status === 'completed' && s.activeSlot === undefined)).toBe(true)
  })

  it('shows at least one repeated target and one load increase for every main lift', () => {
    for (const id of MAIN_LIFTS) {
      const outcomes = sessions.map((s) => s.recommendations?.[id]?.outcome)
      expect(outcomes, id).toContain('repeat')
      expect(outcomes, id).toContain('increase-load')
    }
  })

  it('plans each workout from the previous recommendation', () => {
    for (let i = 1; i < sessions.length; i++) {
      const previous = sessions[i - 1].recommendations?.['db-row']?.prescription
      const row = sessions[i].exercises.find((e) => e.exerciseId === 'db-row')
      if (row?.kind !== 'reps' || previous?.kind !== 'reps') throw new Error('expected reps')
      expect(row.planned.loadKg).toBe(previous.loadKg)
      expect(row.planned.sets.map((s) => s.reps)).toEqual(previous.reps)
    }
  })
})
