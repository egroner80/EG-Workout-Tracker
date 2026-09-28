import { describe, expect, it } from 'vitest'
import { ROPE_BLOCK, SQUAT_ROUTINE, insertSquatRoutine, syncSharedSteps } from './sharedWarmup'
import type { WarmupStepDef, WorkoutTemplate } from './types'

const squatIds = SQUAT_ROUTINE.map((step) => step.id)
const drill = (id: string): WarmupStepDef => ({ id, name: id, durationSec: 45 })
const ids = (warmup: readonly WarmupStepDef[]) => warmup.map((step) => step.id)

function template(id: WorkoutTemplate['id'], warmup: WarmupStepDef[]): WorkoutTemplate {
  return { id, warmup, exercises: [], updatedAt: 0 }
}

describe('insertSquatRoutine', () => {
  it('goes right after the jump-rope block', () => {
    const warmup = [...structuredClone(ROPE_BLOCK), drill('shoulder-cars')]
    expect(ids(insertSquatRoutine(warmup))).toEqual(['jump-rope', 'double-unders', ...squatIds, 'shoulder-cars'])
  })

  it('goes first when there is no jump rope, and never twice', () => {
    expect(ids(insertSquatRoutine([drill('a')]))).toEqual([...squatIds, 'a'])
    const already = [drill('a'), structuredClone(SQUAT_ROUTINE[2])]
    expect(insertSquatRoutine(already)).toBe(already)
  })

  it('inserts copies, so later edits never touch the shared constants', () => {
    const inserted = insertSquatRoutine([])
    inserted[0].name = 'Changed'
    expect(SQUAT_ROUTINE[0].name).not.toBe('Changed')
  })
})

describe('syncSharedSteps', () => {
  const upper = template('upper', [...structuredClone(ROPE_BLOCK), drill('shoulder-cars')])
  const lower = template('lower', [structuredClone(ROPE_BLOCK[0]), drill('ankle-rocks'), structuredClone(ROPE_BLOCK[1])])

  it('copies the definitions of steps both workouts share and keeps the target order', () => {
    const edited = template('upper', [
      { ...upper.warmup[0], cue: 'Quick feet', progression: { stepSec: 10, maxSec: 360 } },
      { ...upper.warmup[1], activation: { afterStepId: 'jump-rope', whenDurationReachesSec: 360 } },
      upper.warmup[2],
    ])
    const synced = syncSharedSteps(edited, lower)
    expect(ids(synced.warmup)).toEqual(['jump-rope', 'ankle-rocks', 'double-unders'])
    expect(synced.warmup[0]).toEqual(edited.warmup[0])
    expect(synced.warmup[1]).toEqual(lower.warmup[1])
    expect(synced.warmup[2].activation?.whenDurationReachesSec).toBe(360)
    expect(synced.id).toBe('lower')
  })

  it('returns the target itself when the shared steps already match', () => {
    expect(syncSharedSteps(upper, lower)).toBe(lower)
  })

  it('leaves a workout with no shared steps alone', () => {
    const other = template('lower', [drill('ankle-rocks')])
    expect(syncSharedSteps(upper, other)).toBe(other)
  })
})
