import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, resetDatabase } from '../data/db'
import { getActiveSession, getSession, saveActiveSession } from '../data/repositories/sessions'
import { bootstrap } from '../data/seed/bootstrap'
import type { RepsExerciseLog, WorkoutSession } from '../domain/types'
import {
  startRest,
  startWarmupStep,
  stepExerciseLoad,
  stepReps,
  toggleSet,
} from '../domain/workout/actions'
import { createEventBus } from './events'
import { installLifecycle } from './lifecycle'
import { clearMirror, readMirror, writeMirror } from './mirror'
import { SaveNotConfirmedError, StoreBusyError, createWorkoutStore, type WorkoutStoreDeps } from './workoutStore'

const T0 = Date.UTC(2026, 8, 27, 17, 0)
let now = T0
const stores: ReturnType<typeof createWorkoutStore>[] = []

function makeStore(deps: WorkoutStoreDeps = {}) {
  const events = createEventBus()
  const cues: string[] = []
  events.subscribe((list) => cues.push(...list.map((e) => e.type)))
  const store = createWorkoutStore({ clock: () => now, isVisible: () => true, events, retryDelaysMs: [2], ...deps })
  stores.push(store)
  return { store, cues }
}

const row = (s: WorkoutSession | null) => s?.exercises.find((e) => e.exerciseId === 'db-row') as RepsExerciseLog

beforeEach(async () => {
  now = T0
  clearMirror()
  await resetDatabase()
  await bootstrap(T0 - 60_000, { demo: false })
})

afterEach(async () => {
  // Let every queued save land before the next test wipes the database.
  await Promise.all(stores.splice(0).map((store) => store.getState().flush(2000)))
  clearMirror()
})

describe('starting and logging', () => {
  it('starts a warm-up session whose persisted copy matches the store', async () => {
    const { store } = makeStore()
    await store.getState().hydrate()
    const session = await store.getState().start('upper')
    expect(session.runtime?.phase).toBe('warmup')
    store.getState().apply((s, ctx) => startWarmupStep(s, ctx))
    await store.getState().flush()
    expect(await getSession(session.id)).toEqual(store.getState().session)
  })

  it('a double-tapped START creates one workout', async () => {
    const { store } = makeStore()
    await store.getState().hydrate()
    const results = await Promise.allSettled([store.getState().start('upper'), store.getState().start('upper')])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await db.sessions.where('status').equals('active').count()).toBe(1)
  })

  it('persists the final state after twenty rapid stepper taps', async () => {
    const { store } = makeStore()
    await store.getState().hydrate()
    await store.getState().start('upper')
    for (let i = 0; i < 20; i++) {
      now += 50
      store.getState().apply((s, ctx) => stepReps(s, 'db-row', 0, i % 2 === 0 ? 1 : -1, ctx))
    }
    await store.getState().flush()
    const stored = await getActiveSession()
    expect(stored?.rev).toBe(store.getState().session?.rev)
    expect(row(stored ?? null).actual[0]).toEqual(row(store.getState().session).actual[0])
  })

  it('emits cue events from actions and ticks', async () => {
    const { store, cues } = makeStore()
    await store.getState().hydrate()
    await store.getState().start('upper')
    store.getState().apply((s, ctx) => startRest(s, 'db-row', ctx))
    for (let t = now + 86_000; t <= now + 90_250; t += 250) store.getState().tick(t)
    expect(cues).toEqual(['tick', 'tick', 'tick', 'complete'])
  })
})

describe('finish, reopen, cancel, discard', () => {
  it('finishes with per-exercise resolutions, stores recommendations, and clears the store', async () => {
    const { store } = makeStore()
    await store.getState().hydrate()
    const session = await store.getState().start('upper')
    store.getState().apply((s, ctx) => toggleSet(s, 'db-row', 0, ctx))
    now += 45 * 60_000
    const resolutions = Object.fromEntries(session.exercises.map((e) => [e.exerciseId, 'done' as const]))
    const id = await store.getState().finish(resolutions)
    expect(store.getState().session).toBeNull()
    const finished = await getSession(id)
    expect(finished).toMatchObject({ status: 'completed', finishedAt: T0 + 45 * 60_000 })
    expect(finished?.recommendations?.['db-row'].outcome).toBe('advance')
    expect(readMirror()).toBeNull()
    await expect(store.getState().finish()).rejects.toThrow()
  })

  it('reopens the latest workout, and cancel edits restores the finished version', async () => {
    const { store } = makeStore()
    await store.getState().hydrate()
    await store.getState().start('upper')
    now += 60_000
    const id = await store.getState().finish({})
    const finished = await getSession(id)

    now += 60_000
    await store.getState().reopen(id)
    expect(store.getState().session).toMatchObject({ id, status: 'active' })
    store.getState().apply((s, ctx) => toggleSet(s, 'dips', 0, ctx))
    await store.getState().cancelEdits()
    const restored = await getSession(id)
    expect(restored?.status).toBe('completed')
    expect(restored?.exercises).toEqual(finished?.exercises)
  })

  it('refuses to reopen while another workout is active', async () => {
    const { store } = makeStore()
    await store.getState().hydrate()
    await store.getState().start('upper')
    const id = await store.getState().finish({})
    await store.getState().start('upper')
    await expect(store.getState().reopen(id)).rejects.toThrow(/in progress/)
  })

  it('a double-tapped Finish finishes once', async () => {
    const { store } = makeStore()
    await store.getState().hydrate()
    const session = await store.getState().start('upper')
    const resolutions = Object.fromEntries(session.exercises.map((e) => [e.exerciseId, 'done' as const]))
    const results = await Promise.allSettled([store.getState().finish(resolutions), store.getState().finish(resolutions)])
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(StoreBusyError)
    expect((await getSession(session.id))?.status).toBe('completed')
    expect(store.getState().busy).toBe(false)
  })

  it('discards a workout and leaves no active session', async () => {
    const { store } = makeStore()
    await store.getState().hydrate()
    const session = await store.getState().start('upper')
    await store.getState().discard()
    expect(store.getState().session).toBeNull()
    expect((await getSession(session.id))?.status).toBe('discarded')
    expect(await getActiveSession()).toBeUndefined()
  })
})

describe('persistence safety', () => {
  it('holds Finish while writes fail and saves the newest snapshot after recovery', async () => {
    let failing = true
    const { store } = makeStore({
      save: async (s) => {
        if (failing) throw new Error('IndexedDB unavailable')
        await saveActiveSession(s)
      },
    })
    await store.getState().hydrate()
    await store.getState().start('upper')
    store.getState().apply((s, ctx) => toggleSet(s, 'db-row', 0, ctx))
    await vi.waitFor(() => expect(store.getState().saveError).toBeTruthy())
    await expect(store.getState().finish({})).rejects.toBeInstanceOf(SaveNotConfirmedError)

    failing = false
    await vi.waitFor(async () => expect(row((await getActiveSession()) ?? null).actual[0].status).toBe('done'))
    await vi.waitFor(() => expect(store.getState().saveError).toBeNull())
  }, 20_000)

  it('restores a mirror with a higher revision than the database', async () => {
    const { store } = makeStore()
    await store.getState().hydrate()
    const session = await store.getState().start('upper')
    const newer = structuredClone(session)
    newer.rev = 7
    row(newer).actual[0] = { ...row(newer).actual[0], status: 'done' }
    writeMirror(newer)

    const second = makeStore().store
    await second.getState().hydrate()
    expect(second.getState().session?.rev).toBe(7)
    await second.getState().flush()
    expect((await getActiveSession())?.rev).toBe(7)
  })

  it('ignores a stale mirror after Finish, and after Discard followed by a new START', async () => {
    const { store } = makeStore()
    await store.getState().hydrate()
    const first = await store.getState().start('upper')
    await store.getState().finish({})
    writeMirror({ ...first, rev: 50 })
    const afterFinish = makeStore().store
    await afterFinish.getState().hydrate()
    expect(afterFinish.getState().session).toBeNull()

    const second = await store.getState().start('upper')
    await store.getState().discard()
    const third = await store.getState().start('upper')
    writeMirror({ ...second, rev: 50 })
    const afterDiscard = makeStore().store
    await afterDiscard.getState().hydrate()
    expect(afterDiscard.getState().session?.id).toBe(third.id)
    expect(readMirror()).toBeNull()
  })

  it('a second window holding an older copy reloads instead of overwriting', async () => {
    const a = makeStore().store
    await a.getState().hydrate()
    await a.getState().start('upper')
    const b = makeStore().store
    await b.getState().hydrate()

    a.getState().apply((s, ctx) => toggleSet(s, 'db-row', 0, ctx))
    await a.getState().flush()
    b.getState().apply((s, ctx) => stepExerciseLoad(s, 'dips', 1, ctx))
    await b.getState().flush()

    await vi.waitFor(() => expect(row(b.getState().session).actual[0].status).toBe('done'))
    expect(row((await getActiveSession()) ?? null).actual[0].status).toBe('done')
  })

  it('shows overtime without a cue when returning long after a rest ended', async () => {
    const { store, cues } = makeStore()
    await store.getState().hydrate()
    await store.getState().start('upper')
    store.getState().apply((s, ctx) => startRest(s, 'db-row', ctx))
    now += 160_000
    store.getState().resync(true)
    expect(store.getState().session?.runtime?.rest?.finishedAt).toBe(T0 + 90_000)
    expect(cues).toEqual([])
  })

  it('restores a START whose insert never landed, from the mirror', async () => {
    const first = makeStore().store
    await first.getState().hydrate()
    const started = await first.getState().start('upper')
    await first.getState().flush()
    // The app died before IndexedDB kept the new workout; only the mirror has it.
    await db.sessions.delete(started.id)
    expect(readMirror()?.id).toBe(started.id)

    const second = makeStore().store
    await second.getState().hydrate()
    expect(second.getState().session?.id).toBe(started.id)
    expect((await getActiveSession())?.id).toBe(started.id)
  })

  it('drops a mirror whose workout has already finished or been replaced', async () => {
    const first = makeStore().store
    await first.getState().hydrate()
    const started = await first.getState().start('upper')
    await first.getState().flush()
    const stale = readMirror()!
    await first.getState().discard()
    writeMirror(stale)

    const second = makeStore().store
    await second.getState().hydrate()
    expect(second.getState().session).toBeNull()
    expect(readMirror()).toBeNull()
    expect((await getSession(started.id))?.status).toBe('discarded')
  })

  it('keeps the mirror when restoring it fails for a storage reason', async () => {
    const first = makeStore().store
    await first.getState().hydrate()
    const started = await first.getState().start('upper')
    await first.getState().flush()
    await db.sessions.delete(started.id)
    const add = vi.spyOn(db.sessions, 'add').mockRejectedValueOnce(new Error('QuotaExceededError'))

    const second = makeStore().store
    await expect(second.getState().hydrate()).rejects.toThrow('QuotaExceededError')
    expect(readMirror()?.id).toBe(started.id)
    add.mockRestore()

    // The next launch succeeds and the workout comes back.
    const third = makeStore().store
    await third.getState().hydrate()
    expect(third.getState().session?.id).toBe(started.id)
  })

  it('keeps an in-progress workout when re-inserting it fails for a storage reason', async () => {
    const { store } = makeStore()
    await store.getState().hydrate()
    const started = await store.getState().start('upper')
    await store.getState().flush()
    await db.sessions.delete(started.id)
    const add = vi.spyOn(db.sessions, 'add').mockRejectedValue(new Error('QuotaExceededError'))

    store.getState().apply((s, ctx) => toggleSet(s, 'pull-ups', 0, ctx))
    await vi.waitFor(() => expect(store.getState().saveError).toMatch('QuotaExceededError'))
    expect(store.getState().session?.id).toBe(started.id)
    expect(readMirror()?.id).toBe(started.id)
    add.mockRestore()
  })

  it('opens the recovery state for an unreadable stored workout', async () => {
    await db.sessions.add({ id: 'bad', status: 'active', activeSlot: 'active' } as unknown as WorkoutSession)
    const { store } = makeStore()
    await store.getState().hydrate()
    expect(store.getState().recovery).not.toBeNull()
    expect(store.getState().session).toBeNull()
    await store.getState().dismissRecovery()
    expect(await getActiveSession()).toBeUndefined()
  })

  it('flushes when the page is hidden', async () => {
    const { store } = makeStore()
    const flush = vi.fn(async () => true)
    store.setState({ flush })
    const remove = installLifecycle(store)
    window.dispatchEvent(new Event('pagehide'))
    expect(flush).toHaveBeenCalled()
    remove()
  })
})
