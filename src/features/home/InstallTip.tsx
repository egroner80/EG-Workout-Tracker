import { isStandalone } from '../../platform/storage'
import styles from './Banner.module.css'

/**
 * Outside the installed app, explain installing: Home Screen apps keep their
 * own storage (separate from Safari tabs) and aren't cleared by Safari's
 * 7-day rule.
 */
export function InstallTip({ onDismiss }: { onDismiss: () => void }) {
  if (isStandalone()) return null
  return (
    <aside className={styles.banner} aria-label="Install the app">
      <p className={styles.text}>
        <strong>Install EG Workout Tracker</strong> from the Share menu → Add to Home Screen. The installed app works offline and
        keeps its history separately from browser tabs.
      </p>
      <button type="button" className={styles.action} onClick={onDismiss}>
        Got it
      </button>
    </aside>
  )
}
