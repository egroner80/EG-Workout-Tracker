import { Button } from '../../components/Button'
import { formatDuration } from '../../domain/format'
import type { ActualEffort, CarryExerciseLog, EffortStage } from '../../domain/types'
import { pauseEffort, resumeEffort, stopEffort } from '../../domain/workout/actions'
import { remainingMs } from '../../domain/workout/timer'
import { useClock } from '../../state/useTicker'
import { useWorkoutStore } from '../../state/workoutStore'
import styles from './EffortTimerOverlay.module.css'

const SIDE = { L: 'Left', R: 'Right' } as const

/** What each stage says: a carry moves the weight from hand to hand, a hold (Copenhagen plank) changes sides. */
function stageText(log: CarryExerciseLog, stage: EffortStage, target: ActualEffort) {
  const hold = log.style === 'hold'
  const side = SIDE[target.side]
  if (stage === 'switch') {
    // `target` is already the side that comes next.
    return hold
      ? { heading: 'Switch sides', subline: `Set up on the ${side.toLowerCase()} side` }
      : { heading: `Switch to ${side.toLowerCase()} hand`, subline: 'Put it down, change hands' }
  }
  const heading = `${side} ${hold ? 'side' : 'hand'} · Set ${target.setIndex + 1}`
  if (stage === 'get-ready') return { heading, subline: hold ? 'Get into position' : 'Pick up the weight' }
  return { heading, subline: log.name }
}

/** Full-screen countdown for one side of a carry or hold: get-ready, the side itself, and the switch to the other side. */
export function EffortTimerOverlay() {
  const effort = useWorkoutStore((state) => state.session?.runtime?.effort ?? null)
  const log = useWorkoutStore((state) =>
    state.session?.exercises.find((e) => e.exerciseId === state.session?.runtime?.effort?.exerciseId),
  )
  const apply = useWorkoutStore((state) => state.apply)
  const now = useClock((state) => state.now)
  if (!effort || !log || log.kind !== 'carry') return null

  const target = log.actual[effort.effortIndex]
  if (!target) return null
  const seconds = Math.ceil(remainingMs(effort.timer, now) / 1000)
  const { heading, subline } = stageText(log, effort.stage, target)

  return (
    <div className={`${styles.overlay} ${styles[effort.stage]}`} role="dialog" aria-modal="true" aria-label={heading}>
      <p className={styles.heading}>{heading}</p>
      <p className={styles.subline}>{subline}</p>
      <p className={styles.time} role="timer" aria-live="off">
        {effort.stage === 'running' ? formatDuration(seconds) : Math.max(1, seconds)}
      </p>
      <div className={styles.controls}>
        {effort.stage === 'running' ? (
          <>
            <Button size="xl" block onClick={() => apply(effort.timer.running ? pauseEffort : resumeEffort)}>
              {effort.timer.running ? 'Pause' : 'Resume'}
            </Button>
            <Button size="xl" variant="primary" block onClick={() => apply(stopEffort)}>
              Stop · record time
            </Button>
          </>
        ) : (
          <Button size="xl" block onClick={() => apply(stopEffort)}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
