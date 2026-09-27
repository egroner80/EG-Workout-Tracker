import { render } from '@testing-library/react'
import { act as reactAct, type ReactElement } from 'react'
import { vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { resetDatabase } from '../data/db'
import { bootstrap } from '../data/seed/bootstrap'
import { DEFAULT_SETTINGS, type AppSettings, type WorkoutSession } from '../domain/types'
import type { PendingResolution } from '../domain/session'
import { startStrength, type ActionContext, type ActionResult } from '../domain/workout/actions'
import { clearMirror } from '../state/mirror'
import { useClock } from '../state/useTicker'
import { useWorkoutStore } from '../state/workoutStore'

/**
 * Component tests drive the real app store against fake-indexeddb, so they
 * exercise the same actions, persistence, and derived targets as the app.
 */
export async function resetApp(options: { demo?: boolean; settings?: Partial<AppSettings> } = {}) {
  await useWorkoutStore.getState().flush(2000)
  useWorkoutStore.setState({
    session: null,
    saveError: null,
    recovery: null,
    busy: false,
    settings: { ...DEFAULT_SETTINGS, ...options.settings },
  })
  clearMirror()
  await resetDatabase()
  await bootstrap(Date.now() - 60_000, { demo: options.demo ?? false })
  useWorkoutStore.setState({ status: 'ready' })
}

export async function startWorkout(): Promise<WorkoutSession> {
  const session = await useWorkoutStore.getState().start()
  useClock.setState({ now: Date.now() })
  return session
}

/** Runs a whole workout through the store: `record` logs actuals, everything else counts as done. */
export async function completeWorkout(record: () => void = () => {}): Promise<string> {
  const session = await startWorkout()
  act(startStrength)
  record()
  const resolutions: Record<string, PendingResolution> = Object.fromEntries(
    session.exercises.map((e) => [e.exerciseId, 'done' as const]),
  )
  return useWorkoutStore.getState().finish(resolutions)
}

/** Applies a domain action through the store, as a tap would. */
export function act(action: (session: WorkoutSession, ctx: ActionContext) => ActionResult) {
  useWorkoutStore.getState().apply(action)
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

export function renderAt(ui: ReactElement, path = '/workout', routePath = '*') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePath} element={ui} />
        {routePath !== '*' && <Route path="*" element={null} />}
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

/**
 * Moves the shared clock forward and runs one ticker frame. Tests fake only
 * Date (faking timers would stall IndexedDB), so taps and ticks agree.
 */
export function advance(ms: number) {
  reactAct(() => {
    vi.setSystemTime(Date.now() + ms)
    const now = Date.now()
    useClock.setState({ now })
    useWorkoutStore.getState().tick(now)
  })
}

/** Advances in ticker-sized frames so completions count as fresh and chain. */
export function advanceFrames(ms: number, frame = 250) {
  for (let elapsed = 0; elapsed < ms; elapsed += frame) advance(frame)
}
