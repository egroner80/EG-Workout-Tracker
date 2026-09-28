import { beforeEach, describe, expect, it } from 'vitest'
import type { WorkoutTemplate } from '../../domain/types'
import { resetDatabase } from '../db'
import { bootstrap } from '../seed/bootstrap'
import { getTemplate, modifyTemplate } from './templateRepo'

const NOW = Date.UTC(2026, 8, 28, 17, 0)
const step = (template: WorkoutTemplate, id: string) => template.warmup.find((s) => s.id === id)

beforeEach(async () => {
  await resetDatabase()
  await bootstrap(NOW, { demo: false })
})

describe('modifyTemplate', () => {
  it('mirrors an edit to a shared warm-up step into the other workout', async () => {
    await modifyTemplate(
      'upper',
      (t) => ({ ...t, warmup: t.warmup.map((s) => (s.id === 'jump-rope' ? { ...s, cue: 'Quick feet' } : s)) }),
      NOW + 1,
    )
    const lower = await getTemplate('lower')
    expect(step(lower, 'jump-rope')?.cue).toBe('Quick feet')
    expect(lower.updatedAt).toBe(NOW + 1)
  })

  it('keeps an edit to a workout’s own step in that workout', async () => {
    await modifyTemplate(
      'lower',
      (t) => ({ ...t, warmup: t.warmup.map((s) => (s.id === 'ankle-rocks' ? { ...s, durationSec: 60 } : s)) }),
      NOW + 1,
    )
    expect(step(await getTemplate('lower'), 'ankle-rocks')?.durationSec).toBe(60)
    expect((await getTemplate('upper')).updatedAt).toBe(0)
  })

  it('mirrors a new jump-rope cap together with the double-unders threshold that follows it', async () => {
    await modifyTemplate(
      'lower',
      (t) => ({
        ...t,
        warmup: t.warmup.map((s) => {
          if (s.id === 'jump-rope') return { ...s, progression: { stepSec: 10, maxSec: 360 } }
          if (s.id === 'double-unders') return { ...s, activation: { afterStepId: 'jump-rope', whenDurationReachesSec: 360 } }
          return s
        }),
      }),
      NOW + 1,
    )
    const upper = await getTemplate('upper')
    expect(step(upper, 'jump-rope')?.progression?.maxSec).toBe(360)
    expect(step(upper, 'double-unders')?.activation?.whenDurationReachesSec).toBe(360)
  })

  it('removes a shared step from one workout only', async () => {
    await modifyTemplate('upper', (t) => ({ ...t, warmup: t.warmup.filter((s) => s.id !== 'deep-squat-hold') }), NOW + 1)
    expect(step(await getTemplate('upper'), 'deep-squat-hold')).toBeUndefined()
    expect(step(await getTemplate('lower'), 'deep-squat-hold')).toBeDefined()
  })
})

describe('getTemplate', () => {
  it('falls back to the seed for a workout that was never stored', async () => {
    await resetDatabase()
    expect((await getTemplate('lower')).exercises[0].id).toBe('bulgarian-split-squat')
  })
})
