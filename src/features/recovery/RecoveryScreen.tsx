import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { useWorkoutStore } from '../../state/workoutStore'
import { downloadJson } from '../settings/exportFile'
import styles from './RecoveryScreen.module.css'

/** Shown instead of crashing when a stored workout can't be read. */
export function RecoveryScreen() {
  const navigate = useNavigate()
  const recovery = useWorkoutStore((state) => state.recovery)
  const [error, setError] = useState<string | null>(null)
  if (!recovery) return null

  const discard = async () => {
    setError(null)
    try {
      await useWorkoutStore.getState().dismissRecovery()
      navigate('/')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not discard it. Try again.')
    }
  }

  return (
    <div className={styles.screen} role="alert">
      <h1 className={styles.title}>This workout can’t be opened</h1>
      <p className={styles.text}>
        {recovery.message} Export it first to keep a copy, then discard it to start fresh. Your history is not affected.
      </p>
      <div className={styles.actions}>
        <Button variant="primary" block onClick={() => downloadJson('eg-workout-tracker-unreadable-workout.json', recovery.raw)}>
          Export the workout data
        </Button>
        <Button variant="danger" block onClick={() => void discard()}>
          Discard it
        </Button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
