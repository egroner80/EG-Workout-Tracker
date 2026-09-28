import { describe, expect, it } from 'vitest'
import { isValidSession } from '../../domain/migrate'
import { createDefaultTemplates } from './defaultTemplate'
import { generateDemoHistory } from './demoHistory'

const NOW = Date.UTC(2026, 8, 27, 17, 0)
const DAY = 24 * 60 * 60 * 1000
const MAIN_LIFTS = ['pull-ups', 'dips', 'db-row', 'db-bench', 'db-press', 'bulgarian-split-squat', 'single-leg-rdl', 'hip-thrust']

describe('generateDemoHistory', () => {
  const sessions = generateDemoHistory({ now: NOW, templates: createDefaultTemplates() })

  it('is deterministic for a fixed date', () => {
    expect(generateDemoHistory({ now: NOW, templates: createDefaultTemplates() })).toEqual(sessions)
  })

  it('spans about eight weeks at three workouts a week and ends before today', () => {
    expect(sessions).toHaveLength(24)
    const first = sessions[0].startedAt
    const last = sessions.at(-1)?.finishedAt ?? 0
    expect(last).toBeLessThan(NOW)
    expect((last - first) / DAY).toBeGreaterThan(49)
    expect((last - first) / DAY).toBeLessThan(63)
  })

  it('alternates upper and lower body, starting with upper', () => {
    expect(sessions.slice(0, 4).map((s) => s.templateId)).toEqual(['upper', 'lower', 'upper', 'lower'])
    expect(sessions.every((s, i) => s.templateId === (i % 2 === 0 ? 'upper' : 'lower'))).toBe(true)
  })

  it('marks every record as demo and finished, and every record is valid', () => {
    expect(sessions.every((s) => s.source === 'demo' && s.status === 'completed' && s.activeSlot === undefined)).toBe(true)
    expect(sessions.every(isValidSession)).toBe(true)
  })

  it('shows at least one repeated target and one load increase for every main lift', () => {
    for (const id of MAIN_LIFTS) {
      const outcomes = sessions.map((s) => s.recommendations?.[id]?.outcome)
      expect(outcomes, id).toContain('repeat')
      expect(outcomes, id).toContain('increase-load')
    }
  })

  it('plans each workout from the previous recommendation for that exercise', () => {
    for (const id of ['db-row', 'hip-thrust']) {
      const withLift = sessions.filter((s) => s.exercises.some((e) => e.exerciseId === id))
      for (let i = 1; i < withLift.length; i++) {
        const previous = withLift[i - 1].recommendations?.[id]?.prescription
        const log = withLift[i].exercises.find((e) => e.exerciseId === id)
        if (log?.kind !== 'reps' || previous?.kind !== 'reps') throw new Error('expected reps')
        expect(log.planned.loadKg).toBe(previous.loadKg)
        expect(log.planned.sets.map((s) => s.reps)).toEqual(previous.reps)
      }
    }
  })

  it('grows the shared jump rope across both workouts', () => {
    const rope = sessions.map((s) => s.warmup.find((step) => step.stepId === 'jump-rope')?.plannedSec ?? 0)
    expect(rope[1]).toBeGreaterThanOrEqual(rope[0])
    expect(rope.at(-1)).toBeGreaterThan(rope[0] + 60)
  })
})
