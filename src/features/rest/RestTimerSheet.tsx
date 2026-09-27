import { Button } from '../../components/Button'
import { IconChevronDown, IconChevronRight } from '../../components/icons'
import { formatDuration } from '../../domain/format'
import {
  addRestTime,
  endRest,
  goToExercise,
  pauseRest,
  resumeRest,
  setRestExpanded,
} from '../../domain/workout/actions'
import { remainingMs } from '../../domain/workout/timer'
import { useClock } from '../../state/useTicker'
import { useWorkoutStore } from '../../state/workoutStore'
import styles from './RestTimerSheet.module.css'

interface RestTimerSheetProps {
  /** The exercise after the current one, offered once the current one is fully logged. */
  next?: { exerciseId: string; name: string }
}

/**
 * The rest countdown. Expanded, it dominates the lower screen; touching the
 * card above collapses it to a slim bar that follows you between exercises.
 */
export function RestTimerSheet({ next }: RestTimerSheetProps) {
  const rest = useWorkoutStore((state) => state.session?.runtime?.rest ?? null)
  const exerciseName = useWorkoutStore(
    (state) => state.session?.exercises.find((e) => e.exerciseId === state.session?.runtime?.rest?.exerciseId)?.shortName,
  )
  const apply = useWorkoutStore((state) => state.apply)
  const now = useClock((state) => state.now)
  if (!rest) return null

  const overtimeSec = rest.finishedAt ? Math.floor((now - rest.finishedAt) / 1000) : 0
  const remainingSec = Math.ceil(remainingMs(rest.timer, now) / 1000)
  const display = rest.finishedAt ? `+${formatDuration(overtimeSec)}` : formatDuration(remainingSec)
  const paused = !rest.timer.running && !rest.finishedAt

  if (!rest.expanded) {
    return (
      <div className={styles.bar} role="timer" aria-label={`Rest ${display}`}>
        <button type="button" className={styles.barMain} onClick={() => apply((s) => setRestExpanded(s, true))}>
          <span className={styles.barLabel}>{rest.finishedAt ? 'Rest done' : paused ? 'Rest paused' : 'Rest'}</span>
          <span className={rest.finishedAt ? styles.barTimeDone : styles.barTime}>{display}</span>
        </button>
        <button type="button" className={styles.barAction} onClick={() => apply((s, ctx) => addRestTime(s, 15, ctx))}>
          +15
        </button>
        <button type="button" className={styles.barAction} onClick={() => apply((s, ctx) => endRest(s, ctx))}>
          {rest.finishedAt ? 'Close' : 'Skip'}
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        className={styles.catcher}
        aria-label="Collapse rest timer"
        onClick={() => apply((s) => setRestExpanded(s, false))}
      />
      <section className={`${styles.sheet} ${rest.finishedAt ? styles.done : ''}`} aria-label="Rest timer">
        <header className={styles.header}>
          <p className={styles.title}>
            {rest.finishedAt ? 'Rest done' : 'Rest'}
            {exerciseName && <span className={styles.subtitle}> · {exerciseName}</span>}
          </p>
          <button
            type="button"
            className={styles.collapse}
            aria-label="Collapse rest timer"
            onClick={() => apply((s) => setRestExpanded(s, false))}
          >
            <IconChevronDown size={26} />
          </button>
        </header>
        <p className={styles.time} role="timer" aria-live="off">
          {display}
        </p>
        <div className={styles.controls}>
          <Button size="lg" onClick={() => apply((s, ctx) => addRestTime(s, 15, ctx))}>
            +15 s
          </Button>
          <Button size="lg" onClick={() => apply((s, ctx) => addRestTime(s, 30, ctx))}>
            +30 s
          </Button>
          <Button
            size="lg"
            disabled={Boolean(rest.finishedAt)}
            onClick={() => apply(paused ? resumeRest : pauseRest)}
          >
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button size="lg" variant="rest" onClick={() => apply((s, ctx) => endRest(s, ctx))}>
            {rest.finishedAt ? 'Close' : 'Skip'}
          </Button>
        </div>
        {next && (
          <Button
            variant="secondary"
            size="lg"
            block
            onClick={() =>
              apply((s, ctx) => {
                const moved = goToExercise(s, next.exerciseId, ctx)
                return setRestExpanded(moved.session, false)
              })
            }
          >
            Next: {next.name}
            <IconChevronRight size={20} />
          </Button>
        )}
      </section>
    </>
  )
}
