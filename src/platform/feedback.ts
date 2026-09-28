import { create } from 'zustand'
import { getMeta, updateMeta } from '../data/repositories/settingsRepo'
import type { CueEvent } from '../domain/workout/cues'
import type { EventBus } from '../state/events'
import type { WorkoutStore } from '../state/workoutStore'
import { createAudio, type AudioController, type CueSound } from './audio'
import { vibrate } from './haptics'
import { requestPersistentStorage } from './storage'
import { createWakeLock, type WakeLockController } from './wakeLock'

/** Device-facing UI state: the keep-awake prompt and the cue flash. */
export const useDeviceState = create<{ needsTapForWakeLock: boolean; flashId: number }>(() => ({
  needsTapForWakeLock: false,
  flashId: 0,
}))

const SOUND: Record<CueEvent['type'], CueSound> = {
  tick: 'tick',
  go: 'go',
  complete: 'complete',
  'switch-sides': 'switch',
}

/** How long a START tap keeps the wake lock wanted while the workout is being created. */
const PRIME_WINDOW_MS = 10_000

export interface FeedbackController {
  /** Call synchronously in the START tap: unlocks audio and requests the wake lock within the gesture. */
  prime: () => void
  testSound: () => void
  dispose: () => void
}

interface FeedbackDeps {
  audio?: AudioController
  wakeLock?: WakeLockController
  requestPersistence?: () => Promise<void>
  now?: () => number
}

async function requestPersistenceOnce(): Promise<void> {
  const meta = await getMeta()
  if (meta.persistResult) return
  await updateMeta({ persistResult: await requestPersistentStorage() })
}

let current: FeedbackController | null = null

/** The installed controller, for UI handlers that must act within a gesture. */
export function feedback(): FeedbackController | null {
  return current
}

/**
 * Turns engine events into sound, vibration, and a flash, and keeps the screen
 * awake during a workout. Audio unlock and wake-lock requests happen inside
 * a global tap listener, never after an awaited database write, because iOS
 * only honors them within the gesture.
 */
export function installFeedback(store: WorkoutStore, events: EventBus, deps: FeedbackDeps = {}): FeedbackController {
  const audio = deps.audio ?? createAudio()
  const wake =
    deps.wakeLock ?? createWakeLock((needsTap) => useDeviceState.setState({ needsTapForWakeLock: needsTap }))
  const persist = deps.requestPersistence ?? requestPersistenceOnce
  const now = deps.now ?? (() => Date.now())

  let primedUntil = 0
  let wanted: boolean | null = null
  let alwaysAudible: boolean | null = null
  let hadSession = store.getState().session !== null

  const computeWanted = () => {
    const { session, settings } = store.getState()
    if (!settings.keepScreenAwake) return false
    if (session) {
      primedUntil = 0
      return true
    }
    return now() < primedUntil
  }

  const sync = () => {
    const nextWanted = computeWanted()
    if (nextWanted !== wanted) {
      wanted = nextWanted
      wake.setWanted(nextWanted)
    }
    const nextAudible = store.getState().settings.alwaysAudible
    if (nextAudible !== alwaysAudible) {
      alwaysAudible = nextAudible
      audio.setAlwaysAudible(nextAudible)
    }
  }

  const onGesture = () => {
    audio.unlock()
    if (computeWanted()) wake.onTap()
  }
  const onVisibility = () => {
    if (document.visibilityState !== 'visible') return
    void audio.revive()
    if (computeWanted()) wake.onVisible()
  }

  const unsubscribeEvents = events.subscribe((list) => {
    const { settings } = store.getState()
    for (const event of list) {
      if (settings.sound) audio.play(SOUND[event.type])
      if (event.type === 'complete' || event.type === 'switch-sides') {
        useDeviceState.setState((state) => ({ flashId: state.flashId + 1 }))
        if (settings.vibration) vibrate(event.type === 'complete' ? 'complete' : 'switch')
      }
    }
  })

  const unsubscribeStore = store.subscribe((state) => {
    sync()
    const hasSession = state.session !== null
    if (hasSession && !hadSession && state.session?.source === 'real') void persist().catch(() => {})
    hadSession = hasSession
  })

  const gestureEvents = ['pointerup', 'touchend', 'click'] as const
  for (const type of gestureEvents) document.addEventListener(type, onGesture, true)
  document.addEventListener('visibilitychange', onVisibility)
  sync()

  const controller: FeedbackController = {
    prime() {
      audio.unlock()
      primedUntil = now() + PRIME_WINDOW_MS
      sync()
      wake.onTap()
    },
    testSound() {
      audio.unlock()
      audio.play('complete')
      vibrate('complete')
    },
    dispose() {
      unsubscribeEvents()
      unsubscribeStore()
      for (const type of gestureEvents) document.removeEventListener(type, onGesture, true)
      document.removeEventListener('visibilitychange', onVisibility)
      if (current === controller) current = null
    },
  }
  current = controller
  return controller
}
