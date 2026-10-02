import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, type ButtonProps } from '../../components/Button'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { IconChevronRight } from '../../components/icons'
import { goToExercise, setRestExpanded } from '../../domain/workout/actions'
import { loadLastTimes } from '../../services/queries'
import { useWorkoutStore } from '../../state/workoutStore'
import { RestTimerCompact, RestTimerSheet } from '../rest/RestTimerSheet'
import { CarryExerciseCard } from './CarryExerciseCard'
import { EffortTimerOverlay } from './EffortTimerOverlay'
import { FinishSheet } from './FinishSheet'
import { RepsExerciseCard } from './RepsExerciseCard'
import styles from './StrengthScreen.module.css'
import { WorkoutTopBar } from './WorkoutTopBar'

export function StrengthScreen() {
  const navigate = useNavigate()
  const session = useWorkoutStore((state) => state.session)
  const apply = useWorkoutStore((state) => state.apply)
  const [finishOpen, setFinishOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sessionId = session?.id
  const startedAt = session?.startedAt
  const exerciseIds = session?.exerciseIds
  const lastTimes = useLiveQuery(
    () => (exerciseIds ? loadLastTimes(exerciseIds, startedAt) : undefined),
    [sessionId, startedAt, exerciseIds],
  )
  if (!session?.runtime) return null

  const exercises = session.exercises
  if (exercises.length === 0) {
    return (
      <div className={styles.screen}>
        <div className={styles.empty}>
          <h1 className={styles.emptyTitle}>No exercises in this workout</h1>
          <p className={styles.emptyText}>Add exercises in Settings for your next workout.</p>
          <Button variant="primary" size="lg" onClick={() => setFinishOpen(true)}>
            Finish workout
          </Button>
        </div>
        <FinishSheet open={finishOpen} onClose={() => setFinishOpen(false)} />
      </div>
    )
  }
  const found = exercises.findIndex((e) => e.exerciseId === session.runtime?.currentExerciseId)
  const index = found >= 0 ? found : 0
  const log = exercises[index]
  const next = exercises[index + 1]
  const allLogged = log.actual.every((set) => set.status !== 'pending')
  const isLast = index === exercises.length - 1
  const lastTime = lastTimes?.get(log.exerciseId)
  const previousOutcome = lastTime?.session.recommendations?.[log.exerciseId]?.outcome
  const reopened = Boolean(session.reopenSnapshot)
  // Exhaustive on purpose: a saved rest without a size still shows, compact.
  const compactRest = Boolean(session.runtime.rest) && !session.runtime.rest?.expanded
  const moveOnProps: ButtonProps = {
    variant: allLogged ? 'primary' : 'secondary',
    size: 'xl',
    block: true,
    className: compactRest ? styles.narrow : undefined,
  }
  const moveOn = isLast ? (
    <Button {...moveOnProps} onClick={() => setFinishOpen(true)}>
      Finish workout
    </Button>
  ) : (
    <Button {...moveOnProps} onClick={() => apply((s, ctx) => goToExercise(s, next.exerciseId, ctx))}>
      Next: {next.shortName}
      <IconChevronRight size={24} />
    </Button>
  )

  const discard = async () => {
    setDiscardOpen(false)
    setError(null)
    try {
      if (reopened) {
        const id = session.id
        await useWorkoutStore.getState().cancelEdits()
        navigate(`/summary/${id}`)
        return
      }
      await useWorkoutStore.getState().discard()
      navigate('/')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work. Try again.')
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <WorkoutTopBar
          session={session}
          index={index}
          onFinish={() => setFinishOpen(true)}
          onDiscard={() => setDiscardOpen(true)}
        />
      </div>

      <div
        className={styles.content}
        key={log.exerciseId}
        onPointerDownCapture={() => {
          // Touching the card tucks the rest timer away without swallowing the tap.
          if (session.runtime?.rest?.expanded) apply((s) => setRestExpanded(s, false))
        }}
      >
        {log.kind === 'reps' ? (
          <RepsExerciseCard log={log} lastTime={lastTime} previousOutcome={previousOutcome} />
        ) : (
          <CarryExerciseCard log={log} lastTime={lastTime} previousOutcome={previousOutcome} />
        )}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actionBar}>
        {/* One wrapper either way, so Next keeps its node (and focus) when rest starts or ends. */}
        <div className={compactRest ? styles.restRow : undefined}>
          {compactRest && <RestTimerCompact />}
          {moveOn}
        </div>
      </div>

      {session.runtime.rest?.expanded === true && (
        <RestTimerSheet next={allLogged && next ? { exerciseId: next.exerciseId, name: next.shortName } : undefined} />
      )}
      <EffortTimerOverlay />
      <FinishSheet open={finishOpen} onClose={() => setFinishOpen(false)} />
      <ConfirmSheet
        open={discardOpen}
        title={reopened ? 'Cancel your edits?' : 'Discard this workout?'}
        description={
          reopened
            ? 'The workout goes back to how it was when you finished it.'
            : 'Nothing from it will be saved to History, and your next targets stay as they are.'
        }
        confirmLabel={reopened ? 'Cancel edits' : 'Discard workout'}
        confirmVariant={reopened ? 'primary' : 'danger'}
        cancelLabel="Keep going"
        onConfirm={() => void discard()}
        onClose={() => setDiscardOpen(false)}
      />
    </div>
  )
}
