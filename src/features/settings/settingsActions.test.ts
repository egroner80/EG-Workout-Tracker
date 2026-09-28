import { beforeEach, describe, expect, it } from 'vitest'
import { getTemplate } from '../../data/repositories/templateRepo'
import type { WorkoutTemplate } from '../../domain/types'
import { resetApp } from '../../test/workoutHarness'
import { moveById, updateExercise, updateTemplate, updateWarmupStep } from './settingsActions'

const step = (template: WorkoutTemplate, id: string) => template.warmup.find((s) => s.id === id)
const exercise = (template: WorkoutTemplate, id: string) => template.exercises.find((e) => e.id === id)

beforeEach(async () => {
  await resetApp()
})

describe('updateWarmupStep', () => {
  it('changes a step both warm-ups share in both workouts', async () => {
    await updateWarmupStep('lower', 'jump-rope', (s) => ({ ...s, cue: 'Stay light on the balls of your feet' }))
    const [upper, lower] = await Promise.all([getTemplate('upper'), getTemplate('lower')])
    expect(step(lower, 'jump-rope')?.cue).toBe('Stay light on the balls of your feet')
    expect(step(upper, 'jump-rope')).toEqual(step(lower, 'jump-rope'))
    expect(upper.updatedAt).toBe(lower.updatedAt)
    expect(upper.updatedAt).toBeGreaterThan(0)
  })

  it('keeps a change to a step only one warm-up has in that workout', async () => {
    const upperBefore = await getTemplate('upper')
    await updateWarmupStep('lower', 'hip-hinges', (s) => ({ ...s, reps: 12 }))
    expect(step(await getTemplate('lower'), 'hip-hinges')?.reps).toBe(12)
    expect(await getTemplate('upper')).toEqual(upperBefore)
  })

  it('changes nothing when the workout has no step with that id', async () => {
    const [upperBefore, lowerBefore] = await Promise.all([getTemplate('upper'), getTemplate('lower')])
    await updateWarmupStep('lower', 'shoulder-cars', (s) => ({ ...s, durationSec: 90 }))
    expect((await getTemplate('lower')).warmup).toEqual(lowerBefore.warmup)
    expect(await getTemplate('upper')).toEqual(upperBefore)
  })
})

describe('updateExercise', () => {
  it('changes an exercise in its own workout only', async () => {
    const upperBefore = await getTemplate('upper')
    await updateExercise('lower', 'hip-thrust', (e) => ({ ...e, restSec: 120 }))
    expect(exercise(await getTemplate('lower'), 'hip-thrust')?.restSec).toBe(120)
    expect(await getTemplate('upper')).toEqual(upperBefore)
  })

  it('never reaches into the other workout for an exercise id', async () => {
    const [upperBefore, lowerBefore] = await Promise.all([getTemplate('upper'), getTemplate('lower')])
    await updateExercise('lower', 'db-row', (e) => ({ ...e, restSec: 30 }))
    expect((await getTemplate('lower')).exercises).toEqual(lowerBefore.exercises)
    expect(await getTemplate('upper')).toEqual(upperBefore)
  })
})

describe('updateTemplate', () => {
  it('keeps adding, removing, and reordering warm-up steps to one workout', async () => {
    await updateTemplate('lower', (t) => ({
      ...t,
      warmup: moveById(
        t.warmup.filter((s) => s.id !== 'deep-squat-hold'),
        'jump-rope',
        1,
      ),
    }))
    const [upper, lower] = await Promise.all([getTemplate('upper'), getTemplate('lower')])
    expect(lower.warmup.slice(0, 2).map((s) => s.id)).toEqual(['double-unders', 'jump-rope'])
    expect(step(lower, 'deep-squat-hold')).toBeUndefined()
    expect(upper.warmup.slice(0, 3).map((s) => s.id)).toEqual(['jump-rope', 'double-unders', 'deep-squat-hold'])
  })
})

describe('moveById', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const ids = (list: { id: string }[]) => list.map((item) => item.id)

  it('swaps an item with its neighbour', () => {
    expect(ids(moveById(items, 'b', -1))).toEqual(['b', 'a', 'c'])
    expect(ids(moveById(items, 'b', 1))).toEqual(['a', 'c', 'b'])
  })

  it('leaves the order alone at either end or for an unknown id, without mutating the input', () => {
    expect(ids(moveById(items, 'a', -1))).toEqual(['a', 'b', 'c'])
    expect(ids(moveById(items, 'c', 1))).toEqual(['a', 'b', 'c'])
    expect(ids(moveById(items, 'x', 1))).toEqual(['a', 'b', 'c'])
    expect(ids(items)).toEqual(['a', 'b', 'c'])
  })
})
