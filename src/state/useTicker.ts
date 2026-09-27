import { useEffect } from 'react'
import { create } from 'zustand'
import type { WorkoutStore } from './workoutStore'

export const TICK_INTERVAL_MS = 250

/** A shared clock so every countdown on screen re-renders in step. */
export const useClock = create<{ now: number }>(() => ({ now: Date.now() }))

/**
 * Drives the active workout: four times a second it resolves expired timers
 * and emits countdown cues. Runs only while a workout is in progress.
 */
export function useWorkoutTicker(store: WorkoutStore): void {
  const active = store((state) => state.session !== null)
  useEffect(() => {
    if (!active) return
    const tick = () => {
      const now = Date.now()
      useClock.setState({ now })
      store.getState().tick(now)
    }
    tick()
    const id = setInterval(tick, TICK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [active, store])
}
