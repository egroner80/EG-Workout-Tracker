import { useWorkoutStore } from '../../state/workoutStore'
import { downloadJson } from '../settings/exportFile'
import styles from './WorkoutStatusBars.module.css'
import type { StatusBarKind } from './useStatusBar'

export function WorkoutStatusBars({ kind }: { kind: StatusBarKind }) {
  const session = useWorkoutStore((state) => state.session)
  if (!kind) return null

  if (kind === 'not-saved') {
    return (
      <div className={`${styles.bar} ${styles.warning}`} role="alert">
        <span>Not saved yet — retrying</span>
        {session && (
          <button
            type="button"
            className={styles.action}
            onClick={() => downloadJson(`overload-workout-${session.id}.json`, session)}
          >
            Export
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={`${styles.bar} ${styles.info}`} role="status">
      <span>Tap anywhere to keep the screen on</span>
    </div>
  )
}
