import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '../db'
import { getMeta } from '../repositories/settingsRepo'
import { getTemplate, saveTemplate } from '../repositories/templateRepo'
import { bootstrap } from './bootstrap'

const NOW = Date.UTC(2026, 8, 27, 17, 0)

beforeEach(async () => {
  await resetDatabase()
})

describe('bootstrap', () => {
  it('seeds the workout with fixed slug ids and an inactive double-unders step', async () => {
    await bootstrap(NOW)
    const template = await getTemplate()
    expect(template.exercises.map((e) => e.id)).toEqual([
      'pull-ups',
      'dips',
      'db-row',
      'db-bench',
      'db-press',
      'hammer-curls',
      'reverse-crunch',
      'suitcase-carry',
    ])
    expect(template.exercises.map((e) => e.name)).toEqual([
      'Pull-ups',
      'Dips',
      'One-arm DB row',
      'DB bench press',
      'Standing DB press',
      'DB hammer curls',
      'Weighted reverse crunch',
      'Suitcase carry',
    ])
    expect(template.warmup.map((s) => [s.id, s.durationSec])).toEqual([
      ['jump-rope', 120],
      ['double-unders', 30],
      ['shoulder-cars', 45],
      ['thoracic-rotations', 45],
      ['scapular-pull-ups', 45],
      ['easy-push-ups', 45],
    ])
    expect(template.updatedAt).toBe(0)
    expect(await getMeta()).toMatchObject({ seeded: true, demoSeeded: true })
  })

  it('adds nothing on a second run and never overwrites an edited template', async () => {
    await bootstrap(NOW)
    const sessionCount = await db.sessions.count()
    const template = await getTemplate()
    await saveTemplate({ ...template, warmup: template.warmup.slice(1), updatedAt: NOW })
    await bootstrap(NOW + 1000)
    expect(await db.sessions.count()).toBe(sessionCount)
    expect((await getTemplate()).warmup).toHaveLength(5)
  })

  it('can seed without demo data', async () => {
    await bootstrap(NOW, { demo: false })
    expect(await db.sessions.count()).toBe(0)
  })
})
