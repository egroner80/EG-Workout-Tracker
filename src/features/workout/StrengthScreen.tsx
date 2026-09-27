import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { Sheet } from '../../components/Sheet'
import { IconChevronRight } from '../../components/icons'
import { goToExercise } from '../../domain/workout/actions'
import { loadLastTimes } from '../../services/queries'
import { useWorkoutStore } from '../../state/workoutStore'
import { RestTimerSheet } from '../rest/RestTimerSheet'
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
  const sessionId = session?.id
  const startedAt = session?.startedAt
  const exerciseIds = session?.exerciseIds
  const lastTimes = useLiveQuery(
    () => (exerciseIds ? loadLastTimes(exerciseIds, startedAt) : undefined),
    [sessionId, startedAt, exerciseIds],
  )
  if (!session?.runtime) return null

  const exercises = session.exercises
  const found = exercises.findIndex((e) => e.exerciseId === session.runtime?.currentExerciseId)
  const index = found >= 0 ? found : 0
  const log = exercises[index]
  const next = exercises[index + 1]
  const allLogged = log.actual.every((set) => set.status !== 'pending')
  const isLast = index === exercises.length - 1
  const lastTime = lastTimes?.get(log.exerciseId)
  const previousOutcome = lastTime?.session.recommendations?.[log.exerciseId]?.outcome
  const reopened = Boolean(session.reopenSnapshot)

  const discard = async () => {
    setDiscardOpen(false)
    if (reopened) {
      const id = session.id
      await useWorkoutStore.getState().cancelEdits()
      navigate(`/summary/${id}`)
      return
    }
    await useWorkoutStore.getState().discard()
    navigate('/')
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

      <div className={styles.content} key={log.exerciseId}>
        {log.kind === 'reps' ? (
          <RepsExerciseCard log={log} lastTime={lastTime} previousOutcome={previousOutcome} />
        ) : (
          <CarryExerciseCard log={log} lastTime={lastTime} previousOutcome={previousOutcome} />
        )}
      </div>

      <div className={styles.actionBar}>
        {isLast ? (
          <Button variant={allLogged ? 'primary' : 'secondary'} size="xl" block onClick={() => setFinishOpen(true)}>
            Finish workout
          </Button>
        ) : (
          <Button
            variant={allLogged ? 'primary' : 'secondary'}
            size="xl"
            block
            onClick={() => apply((s, ctx) => goToExercise(s, next.exerciseId, ctx))}
          >
            Next: {next.shortName}
            <IconChevronRight size={24} />
          </Button>
        )}
      </div>

      <RestTimerSheet next={allLogged && next ? { exerciseId: next.exerciseId, name: next.shortName } : undefined} />
      <EffortTimerOverlay />
      <FinishSheet open={finishOpen} onClose={() => setFinishOpen(false)} />
      <Sheet
        open={discardOpen}
        title={reopened ? 'Cancel your edits?' : 'Discard this workout?'}
        description={
          reopened
            ? 'The workout goes back to how it was when you finished it.'
            : 'Nothing from it will be saved to History, and your next targets stay as they are.'
        }
        onClose={() => setDiscardOpen(false)}
        footer={
          <>
            <Button variant={reopened ? 'primary' : 'danger'} block onClick={() => void discard()}>
              {reopened ? 'Cancel edits' : 'Discard workout'}
            </Button>
            <Button block onClick={() => setDiscardOpen(false)}>
              Keep going
            </Button>
          </>
        }
      >
        {null}
      </Sheet>
    </div>
  )
}
