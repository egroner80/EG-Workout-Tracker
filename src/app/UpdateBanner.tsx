import { useRegisterSW } from 'virtual:pwa-register/react'
import styles from './AppShell.module.css'

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

/**
 * Registers the service worker once (mount this in the shell only) and offers
 * a new version when one is waiting. Applying an update reloads every open
 * window, so the banner only shows where no workout can be interrupted.
 */
export function UpdateBanner({ canShow }: { canShow: boolean }) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      let lastCheck = Date.now()
      // iOS does not re-check for updates when a Home Screen app resumes.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return
        if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return
        lastCheck = Date.now()
        registration.update().catch(() => {})
      })
    },
  })

  if (!needRefresh || !canShow) return null

  return (
    <div className={styles.updateBanner} role="status">
      <span>A new version is ready.</span>
      <div className={styles.updateActions}>
        <button type="button" className={styles.updateLater} onClick={() => setNeedRefresh(false)}>
          Later
        </button>
        <button type="button" className={styles.updateNow} onClick={() => updateServiceWorker(true)}>
          Update
        </button>
      </div>
    </div>
  )
}
