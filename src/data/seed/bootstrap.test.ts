import { beforeEach, describe, expect, it } from 'vitest'
import { SINGLE_LEG_HIP_THRUST } from '../../domain/templateRevisions'
import { buildSession, finishSession, resolvePending } from '../../domain/session'
import { SQUAT_ROUTINE } from '../../domain/sharedWarmup'
import type { WarmupStepDef, WorkoutTemplate } from '../../domain/types'
import { db, resetDatabase, templateKey } from '../db'
import { getMeta } from '../repositories/settingsRepo'
import { getTemplate, saveTemplate } from '../repositories/templateRepo'
import { bootstrap } from './bootstrap'
import { createTemplate } from './defaultTemplate'

const NOW = Date.UTC(2026, 8, 27, 17, 0)
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const squatIds = SQUAT_ROUTINE.map((step) => step.id)

beforeEach(async () => {
  await resetDatabase()
})

/** The single template schema 1 stored under `template`, with the jump-rope cap raised to 6:00. */
function legacyTemplate(updatedAt: number): Record<string, unknown> {
  const upper = createTemplate('upper')
  const warmup = upper.warmup
    .filter((step) => !squatIds.includes(step.id))
    .map((step): WarmupStepDef => {
      if (step.id === 'jump-rope') return { ...step, progression: { stepSec: 10, maxSec: 360 } }
      if (step.id === 'double-unders') return { ...step, activation: { afterStepId: 'jump-rope', whenDurationReachesSec: 360 } }
      return step
    })
  return { ...upper, id: 'default', warmup, updatedAt }
}

const ropeCap = (template: WorkoutTemplate) => template.warmup.find((s) => s.id === 'jump-rope')?.progression?.maxSec

describe('bootstrap', () => {
  it('seeds both workouts with fixed slug ids, the shared warm-up, and an inactive double-unders step', async () => {
    await bootstrap(NOW)
    const upper = await getTemplate('upper')
    expect(upper.exercises.map((e) => [e.id, e.name])).toEqual([
      ['pull-ups', 'Pull-ups'],
      ['dips', 'Dips'],
      ['db-row', 'One-arm DB row'],
      ['db-bench', 'DB bench press'],
      ['db-press', 'Standing DB press'],
      ['hammer-curls', 'DB hammer curls'],
      ['reverse-crunch', 'Weighted reverse crunch'],
      ['suitcase-carry', 'Suitcase carry'],
    ])
    expect(upper.warmup.map((s) => s.id)).toEqual([
      'jump-rope',
      'double-unders',
      ...squatIds,
      'shoulder-cars',
      'thoracic-rotations',
      'scapular-pull-ups',
      'easy-push-ups',
    ])
    const lower = await getTemplate('lower')
    expect(lower.exercises.map((e) => e.id)).toEqual([
      'bulgarian-split-squat',
      'single-leg-rdl',
      'single-leg-hip-thrust',
      'sliding-hamstring-curl',
      'copenhagen-plank',
    ])
    expect([upper.updatedAt, lower.updatedAt]).toEqual([0, 0])
    expect(await db.kv.get(templateKey('upper'))).toBeDefined()
    expect(await db.kv.get(templateKey('lower'))).toBeDefined()
    expect(await getMeta()).toMatchObject({ seeded: true, demoSeeded: true })
  })

  it('adds nothing on a second run and never overwrites an edited template', async () => {
    await bootstrap(NOW)
    const sessionCount = await db.sessions.count()
    const template = await getTemplate('upper')
    await saveTemplate({ ...template, warmup: template.warmup.slice(1), updatedAt: NOW })
    await bootstrap(NOW + 1000)
    expect(await db.sessions.count()).toBe(sessionCount)
    expect((await getTemplate('upper')).warmup).toHaveLength(template.warmup.length - 1)
  })

  it('can seed without demo data', async () => {
    await bootstrap(NOW, { demo: false })
    expect(await db.sessions.count()).toBe(0)
  })

  it('splits the shoulder and back steps of a saved upper-body warm-up into 30 s on each side', async () => {
    const seed = createTemplate('upper')
    const bothSides: Record<string, WarmupStepDef> = {
      'shoulder-cars': { id: 'shoulder-cars', name: 'Shoulder CARs', durationSec: 45, cue: 'Slow, controlled circles — both arms' },
      'thoracic-rotations': { id: 'thoracic-rotations', name: 'Thoracic rotations', durationSec: 45, cue: 'Rotate through the upper back' },
    }
    await saveTemplate({ ...seed, warmup: seed.warmup.map((step) => bothSides[step.id] ?? step), updatedAt: 5 })

    await bootstrap(NOW, { demo: false })
    const upper = await getTemplate('upper')
    const step = (id: string) => upper.warmup.find((s) => s.id === id)
    expect(step('shoulder-cars')).toMatchObject({ perSide: true, durationSec: 30, cue: 'Slow, controlled circles — one arm at a time' })
    expect(step('thoracic-rotations')).toMatchObject({ perSide: true, durationSec: 30, cue: 'Rotate through the upper back — one side at a time' })
    expect(upper.updatedAt).toBe(5)
  })

  it('swaps the two-leg hip thrust in a saved lower-body workout for the single-leg one, keeping edits and past workouts', async () => {
    const seed = createTemplate('lower')
    const twoLeg = { ...SINGLE_LEG_HIP_THRUST, id: 'hip-thrust', name: 'Hip thrust', shortName: 'Hip thrust', perSide: false }
    const saved: WorkoutTemplate = {
      ...seed,
      exercises: seed.exercises.map((e) => {
        if (e.id === SINGLE_LEG_HIP_THRUST.id) return twoLeg
        return e.id === 'bulgarian-split-squat' ? { ...e, restSec: 120 } : e
      }),
      updatedAt: 5,
    }
    await saveTemplate(saved)
    const session = buildSession({ id: 'past', now: NOW - DAY, template: saved, prescriptions: new Map() })
    await db.sessions.add(finishSession(resolvePending(session, { 'hip-thrust': 'done' }), { now: NOW - DAY + HOUR }))

    await bootstrap(NOW, { demo: false })
    const lower = await getTemplate('lower')
    expect(lower.exercises.map((e) => e.id)).toEqual(seed.exercises.map((e) => e.id))
    expect(lower.exercises[2]).toEqual(SINGLE_LEG_HIP_THRUST)
    expect(lower.exercises[0].restSec).toBe(120)
    expect(lower.updatedAt).toBe(5)
    expect((await db.sessions.get('past'))?.exercises.map((e) => e.name)).toContain('Hip thrust')

    // Nothing is left to swap on the next start.
    await bootstrap(NOW + 1000, { demo: false })
    expect(await getTemplate('lower')).toEqual(lower)
  })

  it('moves the single template of earlier versions to upper and seeds lower with the same shared steps', async () => {
    await db.kv.put({ key: 'template', value: legacyTemplate(7) })
    await bootstrap(NOW, { demo: false })

    const upper = await getTemplate('upper')
    expect(upper.id).toBe('upper')
    expect(upper.updatedAt).toBe(7)
    expect(upper.warmup.map((s) => s.id).slice(0, 2 + squatIds.length)).toEqual(['jump-rope', 'double-unders', ...squatIds])
    expect(ropeCap(upper)).toBe(360)

    const lower = await getTemplate('lower')
    expect(ropeCap(lower)).toBe(360)
    expect(lower.warmup.find((s) => s.id === 'double-unders')?.activation?.whenDurationReachesSec).toBe(360)
    // Kept for a build from before the lower-body workout that may still be open.
    expect(await db.kv.get('template')).toBeDefined()

    await bootstrap(NOW + 1000, { demo: false })
    expect(await getTemplate('upper')).toEqual(upper)
    expect(await getTemplate('lower')).toEqual(lower)
  })

  it('lets a newer legacy template replace upper and carries its shared steps into lower; an older one changes nothing', async () => {
    await bootstrap(NOW, { demo: false })
    await saveTemplate({ ...(await getTemplate('upper')), updatedAt: 5 })
    // An older build, still open, saved an edit to the template it knows.
    await db.kv.put({ key: 'template', value: legacyTemplate(9) })
    await bootstrap(NOW + 1, { demo: false })
    expect(ropeCap(await getTemplate('upper'))).toBe(360)
    const lower = await getTemplate('lower')
    expect(ropeCap(lower)).toBe(360)
    expect(lower.updatedAt).toBe(NOW + 1)

    // Edited here since, upper is newer than anything that build wrote.
    await saveTemplate({ ...(await getTemplate('upper')), warmup: createTemplate('upper').warmup, updatedAt: 20 })
    await bootstrap(NOW + 2, { demo: false })
    expect(ropeCap(await getTemplate('upper'))).toBe(300)
    expect(await db.kv.get('template')).toBeDefined()
  })

  it('replaces a stored workout that cannot be read, and never loses a legacy template to it', async () => {
    await db.kv.put({ key: templateKey('upper'), value: { id: 'upper', warmup: 'broken' } as unknown as WorkoutTemplate })
    await db.kv.put({ key: 'template', value: legacyTemplate(7) })
    await expect(bootstrap(NOW, { demo: false })).resolves.toBeUndefined()
    const upper = await getTemplate('upper')
    expect([upper.updatedAt, ropeCap(upper)]).toEqual([7, 360])

    await db.kv.put({ key: templateKey('lower'), value: { id: 'lower', exercises: 7 } as unknown as WorkoutTemplate })
    await expect(bootstrap(NOW + 1, { demo: false })).resolves.toBeUndefined()
    const lower = await getTemplate('lower')
    expect(lower.exercises).toHaveLength(5)
    expect(ropeCap(lower)).toBe(360)
  })

  it('leaves an unreadable legacy template in place and still starts with both workouts', async () => {
    await db.kv.put({ key: 'template', value: { id: 'default', exercises: 'broken' } })
    await expect(bootstrap(NOW, { demo: false })).resolves.toBeUndefined()
    expect(await db.kv.get('template')).toBeDefined()
    expect((await getTemplate('upper')).exercises).toHaveLength(8)
    expect((await getTemplate('lower')).exercises).toHaveLength(5)
  })
})
