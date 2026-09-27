import { liveQuery } from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDatabase } from '../data/db'
import { saveActiveSession } from '../data/repositories/sessions'
import { bootstrap } from '../data/seed/bootstrap'
import type { LastTime } from '../domain/prescription'
import { loadLastTimes } from './queries'
import { finishWorkout, startWorkout } from './workoutCommands'

const T0 = Date.UTC(2026, 8, 27, 17, 0)
const HOUR = 3600_000

beforeEach(async () => {
  await resetDatabase()
  await bootstrap(T0 - 60_000, { demo: false })
})

describe('LAST TIME', () => {
  it('reads only earlier workouts, so saving the current one does not re-run a live query', async () => {
    const earlier = await startWorkout(T0)
    const resolutions = Object.fromEntries(earlier.exercises.map((e) => [e.exerciseId, 'done' as const]))
    await finishWorkout({ sessionId: earlier.id, resolutions, now: T0 + HOUR })
    const current = await startWorkout(T0 + 48 * HOUR)

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
