import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '../data/db'
import { bootstrap } from '../data/seed/bootstrap'
import { SessionStateError } from '../domain/session'
import { cancelWorkoutEdits, discardWorkout, finishWorkout, reopenWorkout, startWorkout } from './workoutCommands'

const T0 = Date.UTC(2026, 8, 27, 17, 0)
const HOUR = 3600_000

async function finishedWorkout(startedAt: number) {
  const session = await startWorkout('upper', startedAt)
  const resolutions = Object.fromEntries(session.exercises.map((e) => [e.exerciseId, 'done' as const]))
  return finishWorkout({ sessionId: session.id, resolutions, now: startedAt + HOUR })
}

beforeEach(async () => {
  await resetDatabase()
  await bootstrap(T0 - 60_000, { demo: false })
})

describe('workout command guards', () => {
  it('refuses to finish a workout that is no longer in progress', async () => {
    const finished = await finishedWorkout(T0)
    await expect(finishWorkout({ sessionId: finished.id, resolutions: {}, now: T0 + 2 * HOUR })).rejects.toThrow(
      new SessionStateError('This workout is no longer in progress'),
    )
    expect((await db.sessions.get(finished.id))?.finishedAt).toBe(finished.finishedAt)
  })

  it('reopens only the latest real workout', async () => {
    const older = await finishedWorkout(T0)
    const latest = await finishedWorkout(T0 + 24 * HOUR)
    await expect(reopenWorkout(older.id, T0 + 26 * HOUR)).rejects.toThrow('Only the latest workout can be edited')
    const reopened = await reopenWorkout(latest.id, T0 + 26 * HOUR)
    expect(reopened).toMatchObject({ id: latest.id, status: 'active' })
  })

  it('refuses to reopen while another workout is in progress', async () => {
    const latest = await finishedWorkout(T0)
    await startWorkout('upper', T0 + 2 * HOUR)
    await expect(reopenWorkout(latest.id, T0 + 3 * HOUR)).rejects.toThrow('Finish or discard the workout in progress first')
  })

  it('reports a missing workout when cancelling edits or discarding', async () => {
    await expect(cancelWorkoutEdits('nope', T0)).rejects.toThrow('Workout not found')
    await expect(discardWorkout('nope', T0)).rejects.toThrow('Workout not found')
  })
})
