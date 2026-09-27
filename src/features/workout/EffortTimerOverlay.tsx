import { Button } from '../../components/Button'
import { formatDuration } from '../../domain/format'
import { pauseEffort, resumeEffort, stopEffort } from '../../domain/workout/actions'
import { remainingMs } from '../../domain/workout/timer'
import { useClock } from '../../state/useTicker'
import { useWorkoutStore } from '../../state/workoutStore'
import styles from './EffortTimerOverlay.module.css'

const SIDE = { L: 'Left', R: 'Right' } as const

/** Full-screen carry countdown: get-ready, the side itself, and the switch to the other hand. */
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
  const sideName = SIDE[target.side]
  const heading =
    effort.stage === 'switch' ? `Switch to ${sideName.toLowerCase()} hand` : `${sideName} hand · Set ${target.setIndex + 1}`
  const subline =
    effort.stage === 'get-ready' ? 'Pick up the weight' : effort.stage === 'switch' ? 'Put it down, change hands' : log.name

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
