import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { useWorkoutStore } from '../../state/workoutStore'
import { downloadJson } from '../settings/exportFile'
import styles from './RecoveryScreen.module.css'

/** The workout screen failed to render: the workout stays saved; offer a copy and a way out. */
export function WorkoutError() {
  const navigate = useNavigate()
  const session = useWorkoutStore((state) => state.session)
  const busy = useWorkoutStore((state) => state.busy)
  const [error, setError] = useState<string | null>(null)
  const reopened = Boolean(session?.reopenSnapshot)

  const leave = async () => {
    setError(null)
    try {
      if (reopened) await useWorkoutStore.getState().cancelEdits()
      else await useWorkoutStore.getState().discard()
      navigate('/')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work. Try again.')
    }
  }

  return (
    <div className={styles.screen} role="alert">
      <h1 className={styles.title}>This workout can’t be shown</h1>
      <p className={styles.text}>
        It is still saved. Export a copy to keep it, then {reopened ? 'cancel your edits' : 'discard it'} to carry on.
      </p>
      <div className={styles.actions}>
        {session && (
          <>
            <Button variant="primary" block onClick={() => downloadJson('eg-workout-tracker-workout.json', session)}>
              Export the workout data
            </Button>
            <Button variant="danger" block disabled={busy} onClick={() => void leave()}>
              {reopened ? 'Cancel edits' : 'Discard it'}
            </Button>
          </>
        )}
        <Button block onClick={() => navigate('/')}>
          Go to Today
        </Button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
