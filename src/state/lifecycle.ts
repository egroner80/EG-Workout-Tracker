import type { WorkoutStore } from './workoutStore'

/**
 * Page lifecycle wiring. Becoming visible (or restored from the back-forward
 * cache) resolves timers that ran out meanwhile; becoming hidden — the last
 * event mobile browsers reliably deliver — flushes the save queue.
 */
export function installLifecycle(store: WorkoutStore): () => void {
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') void store.getState().flush()
    else store.getState().resync(true)
  }
  const onPageShow = () => store.getState().resync(document.visibilityState !== 'hidden')
  const onPageHide = () => {
    void store.getState().flush()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pageshow', onPageShow)
  window.addEventListener('pagehide', onPageHide)
  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pageshow', onPageShow)
    window.removeEventListener('pagehide', onPageHide)
  }
}
