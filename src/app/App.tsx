import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router/dom'
import { bootstrap } from '../data/seed/bootstrap'
import { installFeedback } from '../platform/feedback'
import { workoutEvents } from '../state/events'
import { installLifecycle } from '../state/lifecycle'
import { useWorkoutTicker } from '../state/useTicker'
import { useWorkoutStore } from '../state/workoutStore'
import styles from './App.module.css'
import { FlashOverlay } from './FlashOverlay'
import { createAppRouter } from './routes'

let startup: Promise<void> | null = null

/** Seeds the database once, then restores any workout in progress. */
function startApp(): Promise<void> {
  startup ??= bootstrap(Date.now()).then(() => useWorkoutStore.getState().hydrate())
  return startup
}

function useTheme() {
  const theme = useWorkoutStore((state) => state.settings.theme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
}

export function App() {
  const [router] = useState(createAppRouter)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    startApp().then(
      () => !cancelled && setStatus('ready'),
      (error: unknown) => {
        console.error('Startup failed', error)
        if (!cancelled) setStatus('error')
      },
    )
    const removeLifecycle = installLifecycle(useWorkoutStore)
    const feedback = installFeedback(useWorkoutStore, workoutEvents)
    return () => {
      cancelled = true
      removeLifecycle()
      feedback.dispose()
    }
  }, [])

  useWorkoutTicker(useWorkoutStore)
  useTheme()

  if (status === 'error') {
    return (
      <div className={styles.center} role="alert">
        <h1 className={styles.title}>Storage is unavailable</h1>
        <p className={styles.text}>
          This browser is blocking on-device storage, so workouts can't be saved. Leave private browsing, or open the app
          from your Home Screen.
        </p>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className={styles.center} aria-busy="true">
        <img className={styles.logo} src="icon.svg" alt="" width={72} height={72} />
        <span className="visually-hidden">Loading</span>
      </div>
    )
  }

  return (
    <>
      <RouterProvider router={router} />
      <FlashOverlay />
    </>
  )
}
