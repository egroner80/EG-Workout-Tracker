import { Link } from 'react-router'
import styles from './App.module.css'

/**
 * Shown in place of a screen that failed to render. It renders inside the
 * shell, so the tab bar stays and Settings (with backup) is always reachable.
 */
export function ScreenError() {
  return (
    <div className={styles.screenError} role="alert">
      <h1 className={styles.title}>This screen couldn’t be shown</h1>
      <p className={styles.text}>Your workouts are still saved on this device. You can back them up from Settings.</p>
      <div className={styles.links}>
        <Link to="/" className={styles.link}>
          Go to Today
        </Link>
        <Link to="/settings" className={styles.link}>
          Open Settings
        </Link>
      </div>
    </div>
  )
}
