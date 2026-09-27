import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { Sheet } from '../../components/Sheet'
import { isLogged, pendingExercises, type PendingResolution } from '../../domain/session'
import { useWorkoutStore } from '../../state/workoutStore'
import styles from './FinishSheet.module.css'

interface FinishSheetProps {
  open: boolean
  onClose: () => void
}

/**
 * Finish asks, per exercise, what happened to sets that were never tapped —
 * nothing is preselected, so a forgotten tap can't silently pass or fail an
 * exercise. A workout with nothing logged offers Discard instead.
 */
export function FinishSheet({ open, onClose }: FinishSheetProps) {
  const navigate = useNavigate()
  const session = useWorkoutStore((state) => state.session)
  const busy = useWorkoutStore((state) => state.busy)
  const saveError = useWorkoutStore((state) => state.saveError)
  const [choices, setChoices] = useState<Record<string, PendingResolution>>({})
  const [error, setError] = useState<string | null>(null)
  if (!session) return null

  const pending = pendingExercises(session)
  const logged = isLogged(session)
  const reopened = Boolean(session.reopenSnapshot)
  const allChosen = pending.every((entry) => choices[entry.exerciseId])

  const close = () => {
    setChoices({})
    setError(null)
    onClose()
  }

  const finish = async () => {
    setError(null)
    try {
      const id = await useWorkoutStore.getState().finish(choices)
      setChoices({})
      navigate(`/summary/${id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not finish the workout')
    }
  }

  if (!logged) {
    return (
      <Sheet
        open={open}
        title="Nothing logged yet"
        description={
          reopened
            ? 'Cancel your edits to keep the finished workout as it was.'
            : 'There is nothing to save. Discard this workout, or keep going.'
        }
        onClose={close}
        footer={
          <>
            <Button
              variant={reopened ? 'primary' : 'danger'}
              block
              onClick={() => {
                close()
                void (reopened ? useWorkoutStore.getState().cancelEdits() : useWorkoutStore.getState().discard()).then(() =>
                  navigate('/'),
                )
              }}
            >
              {reopened ? 'Cancel edits' : 'Discard workout'}
            </Button>
            <Button block onClick={close}>
              Keep going
            </Button>
          </>
        }
      >
        {null}
      </Sheet>
    )
  }

  return (
    <Sheet
      open={open}
      title="Finish workout?"
      description={
        pending.length > 0
          ? 'Some sets were never tapped. What happened to them?'
          : 'Everything is logged. Your next targets are calculated from what you actually did.'
      }
      onClose={close}
      footer={
        <>
          {(error || saveError) && (
            <p className={styles.error} role="alert">
              {error ?? 'Saving… your latest changes have not reached storage yet.'}
            </p>
          )}
          <Button variant="primary" size="lg" block disabled={!allChosen || busy} onClick={() => void finish()}>
            {busy ? 'Saving…' : 'Finish workout'}
          </Button>
          <Button block onClick={close}>
            Keep going
          </Button>
        </>
      }
    >
      {pending.length > 0 && (
        <ul className={styles.list}>
          {pending.map((entry) => (
            <li key={entry.exerciseId} className={styles.row}>
              <p className={styles.name}>
                {entry.name}
                <span className={styles.count}>
                  {entry.pending} {entry.pending === 1 ? 'set' : 'sets'} not logged
                </span>
              </p>
              <div className={styles.choice} role="radiogroup" aria-label={`${entry.name} unlogged sets`}>
                {(['done', 'skipped'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={choices[entry.exerciseId] === value}
                    className={`${styles.option} ${choices[entry.exerciseId] === value ? styles.selected : ''}`}
                    onClick={() => setChoices((current) => ({ ...current, [entry.exerciseId]: value }))}
                  >
                    {value === 'done' ? 'Done as prescribed' : 'Skipped'}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}
