import { beforeEach, describe, expect, it } from 'vitest'
import { SQUAT_ROUTINE } from '../../domain/sharedWarmup'
import type { WarmupStepDef, WorkoutTemplate } from '../../domain/types'
import { db, resetDatabase, templateKey } from '../db'
import { getMeta } from '../repositories/settingsRepo'
import { getTemplate, saveTemplate } from '../repositories/templateRepo'
import { bootstrap } from './bootstrap'
import { createTemplate } from './defaultTemplate'

const NOW = Date.UTC(2026, 8, 27, 17, 0)
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
      'hip-thrust',
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
    expect(await db.kv.get('template')).toBeUndefined()

    await bootstrap(NOW + 1000, { demo: false })
    expect(await getTemplate('upper')).toEqual(upper)
    expect(await getTemplate('lower')).toEqual(lower)
  })

  it('lets a newer legacy template replace upper, and drops an older one', async () => {
    await saveTemplate({ ...createTemplate('upper'), updatedAt: 5 })
    await db.kv.put({ key: 'template', value: legacyTemplate(9) })
    await bootstrap(NOW, { demo: false })
    expect(ropeCap(await getTemplate('upper'))).toBe(360)

    await db.kv.put({ key: 'template', value: legacyTemplate(3) })
    await saveTemplate({ ...(await getTemplate('upper')), warmup: createTemplate('upper').warmup, updatedAt: 10 })
    await bootstrap(NOW, { demo: false })
    expect(ropeCap(await getTemplate('upper'))).toBe(300)
    expect(await db.kv.get('template')).toBeUndefined()
  })

  it('leaves an unreadable legacy template in place and still starts with both workouts', async () => {
    await db.kv.put({ key: 'template', value: { id: 'default', exercises: 'broken' } })
    await expect(bootstrap(NOW, { demo: false })).resolves.toBeUndefined()
    expect(await db.kv.get('template')).toBeDefined()
    expect((await getTemplate('upper')).exercises).toHaveLength(8)
    expect((await getTemplate('lower')).exercises).toHaveLength(5)
  })
})
