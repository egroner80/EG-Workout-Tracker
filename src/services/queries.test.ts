import { liveQuery } from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, resetDatabase } from '../data/db'
import { saveActiveSession } from '../data/repositories/sessions'
import { bootstrap } from '../data/seed/bootstrap'
import { createTemplate } from '../data/seed/defaultTemplate'
import { deriveCurrentPrescriptions, type LastTime } from '../domain/prescription'
import { buildSession, discardSession, finishSession, softDeleteSession } from '../domain/session'
import type { TemplateId, WorkoutSession } from '../domain/types'
import { loadLastTimes, loadPrescriptionContext, loadRecentWorkouts } from './queries'
import { finishWorkout, startWorkout } from './workoutCommands'

const T0 = Date.UTC(2026, 8, 27, 17, 0)
const HOUR = 3600_000

beforeEach(async () => {
  await resetDatabase()
  await bootstrap(T0 - 60_000, { demo: false })
})

describe('LAST TIME', () => {
  it('reads only earlier workouts, so saving the current one does not re-run a live query', async () => {
    const earlier = await startWorkout('upper', T0)
    const resolutions = Object.fromEntries(earlier.exercises.map((e) => [e.exerciseId, 'done' as const]))
    await finishWorkout({ sessionId: earlier.id, resolutions, now: T0 + HOUR })
    const current = await startWorkout('upper', T0 + 48 * HOUR)

    const emissions: Map<string, LastTime>[] = []
    const subscription = liveQuery(() => loadLastTimes(current.exerciseIds, current.startedAt)).subscribe((value) =>
      emissions.push(value),
    )
    await vi.waitFor(() => expect(emissions).toHaveLength(1))
    expect(emissions[0].get('db-row')?.session.id).toBe(earlier.id)

    await saveActiveSession({ ...current, rev: current.rev + 1, updatedAt: T0 + 48 * HOUR + 1000 })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(emissions).toHaveLength(1)
    subscription.unsubscribe()
  })
})

describe('targets across workouts', () => {
  it('carries the jump rope from an upper-body workout into the next lower-body one', async () => {
    const upper = await startWorkout('upper', T0)
    const warmup = upper.warmup.map((step) =>
      step.stepId === 'jump-rope' ? { ...step, completed: true, elapsedMs: step.plannedSec * 1000 } : step,
    )
    await saveActiveSession({ ...upper, warmup, rev: upper.rev + 1, updatedAt: T0 + 1000 })
    const resolutions = Object.fromEntries(upper.exercises.map((e) => [e.exerciseId, 'done' as const]))
    await finishWorkout({ sessionId: upper.id, resolutions, now: T0 + HOUR })

    const context = await loadPrescriptionContext('lower')
    expect(context.template.id).toBe('lower')
    expect(deriveCurrentPrescriptions(context).get('jump-rope')?.prescription).toEqual({
      kind: 'warmup',
      durationSec: 130,
      active: true,
    })
    const lower = await startWorkout('lower', T0 + 48 * HOUR)
    expect(lower.templateId).toBe('lower')
    expect(lower.warmup.find((s) => s.stepId === 'jump-rope')?.plannedSec).toBe(130)
  })
})

describe('double unders across workouts', () => {
  it('unlocks double unders for the next workout of either type once a lower workout reaches 5:00 of rope', async () => {
    const lower = buildSession({
      id: 'l-rope',
      now: T0,
      template: createTemplate('lower'),
      prescriptions: new Map([['jump-rope', { kind: 'warmup' as const, durationSec: 300, active: true }]]),
      source: 'real',
    })
    const warmup = lower.warmup.map((step) =>
      step.stepId === 'jump-rope' ? { ...step, completed: true, elapsedMs: 300_000 } : step,
    )
    await db.sessions.add(finishSession({ ...lower, warmup }, { now: T0 + HOUR }))

    const upper = await startWorkout('upper', T0 + 48 * HOUR)
    expect(upper.warmup.find((s) => s.stepId === 'double-unders')).toMatchObject({ active: true, plannedSec: 30 })
    expect(upper.warmup.find((s) => s.stepId === 'jump-rope')?.plannedSec).toBe(300)
  })
})

describe('recent workouts', () => {
  function finished(id: string, templateId: TemplateId, at: number, source: 'real' | 'demo' = 'real'): WorkoutSession {
    const session = buildSession({ id, now: at - HOUR, template: createTemplate(templateId), prescriptions: new Map(), source })
    return finishSession(session, { now: at })
  }

  it('lists finished real workouts newest first with their type; older untyped ones count as upper', async () => {
    const { templateId: _untyped, ...legacy } = finished('legacy', 'upper', T0)
    const discarded = discardSession(
      buildSession({ id: 'thrown', now: T0 + 30 * HOUR, template: createTemplate('lower'), prescriptions: new Map() }),
      T0 + 31 * HOUR,
    )
    await db.sessions.bulkAdd([
      legacy,
      finished('u1', 'upper', T0 + 24 * HOUR),
      finished('l1', 'lower', T0 + 48 * HOUR),
      discarded,
      softDeleteSession(finished('gone', 'lower', T0 + 60 * HOUR), T0 + 61 * HOUR),
      finished('demo-01', 'lower', T0 + 70 * HOUR, 'demo'),
    ])

    expect(await loadRecentWorkouts(5)).toEqual([
      { id: 'l1', templateId: 'lower', startedAt: T0 + 47 * HOUR, finishedAt: T0 + 48 * HOUR },
      { id: 'u1', templateId: 'upper', startedAt: T0 + 23 * HOUR, finishedAt: T0 + 24 * HOUR },
      { id: 'legacy', templateId: 'upper', startedAt: T0 - HOUR, finishedAt: T0 },
    ])
    expect((await loadRecentWorkouts(2)).map((w) => w.id)).toEqual(['l1', 'u1'])
  })
})
