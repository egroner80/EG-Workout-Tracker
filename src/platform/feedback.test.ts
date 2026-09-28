import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { AppSettings, WorkoutSession } from '../domain/types'
import { DEFAULT_SETTINGS } from '../domain/types'
import { createEventBus } from '../state/events'
import type { WorkoutState, WorkoutStore } from '../state/workoutStore'
import type { AudioController } from './audio'
import { installFeedback, useDeviceState, type FeedbackController } from './feedback'
import type { WakeLockController } from './wakeLock'

type Calls = string[]

function fakes(calls: Calls) {
  const audio: AudioController = {
    unlock: () => calls.push('unlock'),
    play: (sound) => calls.push(`play:${sound}`),
    setAlwaysAudible: (on) => calls.push(`audible:${on}`),
    revive: async () => {
      calls.push('revive')
    },
    state: () => 'running',
  }
  const wakeLock: WakeLockController = {
    setWanted: (wanted) => calls.push(`wanted:${wanted}`),
    onTap: () => calls.push('wake:tap'),
    onVisible: () => calls.push('wake:visible'),
  }
  return { audio, wakeLock }
}

function fakeStore(settings: Partial<AppSettings> = {}): WorkoutStore {
  return create<Pick<WorkoutState, 'session' | 'settings'>>()(() => ({
    session: null,
    settings: { ...DEFAULT_SETTINGS, ...settings },
  })) as unknown as WorkoutStore
}

const session = { id: 's1', source: 'real' } as WorkoutSession

let controller: FeedbackController | null = null
let now = 0

beforeEach(() => {
  now = 1_000
  useDeviceState.setState({ needsTapForWakeLock: false, flashId: 0 })
  Object.defineProperty(navigator, 'vibrate', { value: vi.fn(() => true), configurable: true })
})

afterEach(() => {
  controller?.dispose()
  controller = null
})

describe('installFeedback', () => {
  it('plays, flashes, and vibrates on completion; ticks only beep', () => {
    const calls: Calls = []
    const events = createEventBus()
    controller = installFeedback(fakeStore(), events, { ...fakes(calls), requestPersistence: async () => {} })
    events.emit([{ type: 'tick', secondsLeft: 2 }, { type: 'complete' }])
    expect(calls).toContain('play:tick')
    expect(calls).toContain('play:complete')
    expect(useDeviceState.getState().flashId).toBe(1)
    expect(navigator.vibrate).toHaveBeenCalledTimes(1)
  })

  it('still flashes with sound and vibration off', () => {
    const calls: Calls = []
    const events = createEventBus()
    controller = installFeedback(fakeStore({ sound: false, vibration: false }), events, {
      ...fakes(calls),
      requestPersistence: async () => {},
    })
    events.emit([{ type: 'switch-sides' }])
    expect(calls.filter((c) => c.startsWith('play'))).toEqual([])
    expect(useDeviceState.getState().flashId).toBe(1)
    expect(navigator.vibrate).not.toHaveBeenCalled()
  })

  it('unlocks audio and requests the wake lock within the START gesture, before any awaited work', () => {
    const calls: Calls = []
    const store = fakeStore()
    controller = installFeedback(store, createEventBus(), { ...fakes(calls), requestPersistence: async () => {}, now: () => now })
    calls.length = 0
    controller.prime()
    expect(calls).toEqual(['unlock', 'wanted:true', 'wake:tap'])

    // While the workout is being created (no session yet), the lock stays wanted.
    store.setState({ busy: true } as Partial<WorkoutState>)
    expect(calls).not.toContain('wanted:false')

    store.setState({ session })
    store.setState({ session: null })
    expect(calls.at(-1)).toBe('wanted:false')
  })

  it('requests persistent storage once when the first real workout starts', async () => {
    const persist = vi.fn(async () => {})
    const store = fakeStore()
    controller = installFeedback(store, createEventBus(), { ...fakes([]), requestPersistence: persist })
    store.setState({ session })
    store.setState({ session: { ...session } })
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('a tap during a restored workout re-requests the wake lock', () => {
    const calls: Calls = []
    const store = fakeStore()
    store.setState({ session })
    controller = installFeedback(store, createEventBus(), { ...fakes(calls), requestPersistence: async () => {} })
    document.body.dispatchEvent(new Event('click', { bubbles: true }))
    expect(calls).toContain('wake:tap')
  })
})
