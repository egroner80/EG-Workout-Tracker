import type { CueEvent } from '../domain/workout/cues'

type Listener = (events: CueEvent[]) => void

/** Cue events from the workout engine, consumed by device feedback and the flash overlay. */
export function createEventBus() {
  const listeners = new Set<Listener>()
  return {
    subscribe(listener: Listener): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit(events: CueEvent[]): void {
      if (events.length === 0) return
      for (const listener of listeners) listener(events)
    },
  }
}

export type EventBus = ReturnType<typeof createEventBus>

export const workoutEvents = createEventBus()
