import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { useWorkoutStore } from '../../state/workoutStore'
import { downloadJson } from '../settings/exportFile'
import styles from './RecoveryScreen.module.css'

/** Shown instead of crashing when a stored workout can't be read. */
export function RecoveryScreen() {
  const navigate = useNavigate()
  const recovery = useWorkoutStore((state) => state.recovery)
  if (!recovery) return null
  return (
    <div className={styles.screen} role="alert">
      <h1 className={styles.title}>This workout can’t be opened</h1>
      <p className={styles.text}>
        {recovery.message} Export it first to keep a copy, then discard it to start fresh. Your history is not affected.
      </p>
      <div className={styles.actions}>
        <Button variant="primary" block onClick={() => downloadJson('overload-unreadable-workout.json', recovery.raw)}>
          Export the workout data
        </Button>
        <Button
          variant="danger"
          block
          onClick={() => {
            void useWorkoutStore.getState().dismissRecovery().then(() => navigate('/'))
          }}
        >
          Discard it
        </Button>
      </div>
    </div>
  )
}
