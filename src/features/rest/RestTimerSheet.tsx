import { useEffect, useRef, type CSSProperties } from 'react'
import { Button } from '../../components/Button'
import { IconArrowUp, IconChevronDown, IconChevronRight } from '../../components/icons'
import { formatDuration } from '../../domain/format'
import {
  addRestTime,
  endRest,
  goToExercise,
  pauseRest,
  resumeRest,
  setRestExpanded,
} from '../../domain/workout/actions'
import { secondsLeft } from '../../domain/workout/timer'
import { useClock } from '../../state/useTicker'
import { useWorkoutStore } from '../../state/workoutStore'
import styles from './RestTimerSheet.module.css'

type Toggle = 'expand' | 'collapse'

/** Past this, a focus request is stale and the newly shown size leaves focus alone. */
const FOCUS_HANDOFF_MS = 1000

/**
 * The toggle that should take focus once the other size has rendered, so a
 * keyboard or screen-reader user isn't dropped when their button unmounts.
 * Only a press of Expand or Collapse sets it.
 */
let pendingFocus: { toggle: Toggle; at: number } | null = null

function requestFocus(toggle: Toggle) {
  pendingFocus = { toggle, at: Date.now() }
}

function takeFocus(toggle: Toggle, element: HTMLElement | null) {
  const pending = pendingFocus
  if (pending?.toggle !== toggle) return
  pendingFocus = null
  if (Date.now() - pending.at < FOCUS_HANDOFF_MS) element?.focus()
}

/** The running rest, as both sizes show it. */
function useRest() {
  const rest = useWorkoutStore((state) => state.session?.runtime?.rest ?? null)
  const apply = useWorkoutStore((state) => state.apply)
  const now = useClock((state) => state.now)
  if (!rest) return null
  const done = Boolean(rest.finishedAt)
  const paused = !rest.timer.running && !done
  const overtimeSec = rest.finishedAt ? Math.floor((now - rest.finishedAt) / 1000) : 0
  return {
    apply,
    done,
    paused,
    display: done ? `+${formatDuration(overtimeSec)}` : formatDuration(secondsLeft(rest.timer, now)),
    label: done ? 'Rest done' : paused ? 'Rest paused' : 'Rest',
  }
}

/**
 * The rest countdown as it normally shows: inside the action bar, beside
 * Next, so the card above keeps every pixel and the set just logged stays
 * reachable. Tapping the countdown opens the large view.
 */
export function RestTimerCompact() {
  const shown = useRest()
  const expandRef = useRef<HTMLButtonElement>(null)
  useEffect(() => takeFocus('expand', expandRef.current), [])
  if (!shown) return null
  const { apply, done, display, label } = shown

  return (
    <section className={`${styles.compact} ${done ? styles.compactDone : ''}`} aria-label="Rest timer">
      <div className={styles.face}>
        <span className={styles.faceTop}>
          <span className={styles.faceLabel}>{label}</span>
          <IconArrowUp size={16} className={styles.faceIcon} />
        </span>
        <span
          className={styles.faceTime}
          style={{ '--chars': display.length } as CSSProperties}
          role="timer"
          aria-live="off"
        >
          {display}
        </span>
        <button
          ref={expandRef}
          type="button"
          className={styles.expand}
          aria-label="Expand rest timer"
          onClick={() => {
            requestFocus('collapse')
            apply((s) => setRestExpanded(s, true))
          }}
        />
      </div>
      <button type="button" className={styles.dismiss} onClick={() => apply(endRest)}>
        {done ? 'Close' : 'Skip'}
      </button>
    </section>
  )
}

interface RestTimerSheetProps {
  /** The exercise after the current one, offered once the current one is fully logged. */
  next?: { exerciseId: string; name: string }
}

/** The large rest view, opened from the compact countdown. */
export function RestTimerSheet({ next }: RestTimerSheetProps) {
  const shown = useRest()
  const exerciseName = useWorkoutStore(
    (state) => state.session?.exercises.find((e) => e.exerciseId === state.session?.runtime?.rest?.exerciseId)?.shortName,
  )
  const collapseRef = useRef<HTMLButtonElement>(null)
  useEffect(() => takeFocus('collapse', collapseRef.current), [])
  if (!shown) return null
  const { apply, done, paused, display, label } = shown

  return (
    <section className={`${styles.sheet} ${done ? styles.done : ''}`} aria-label="Rest timer">
      <header className={styles.header}>
        <p className={styles.title}>
          {label}
          {exerciseName && <span className={styles.subtitle}> · {exerciseName}</span>}
        </p>
        <button
          ref={collapseRef}
          type="button"
          className={styles.collapse}
          aria-label="Collapse rest timer"
          onClick={() => {
            requestFocus('expand')
            apply((s) => setRestExpanded(s, false))
          }}
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
        <Button size="lg" disabled={done} onClick={() => apply(paused ? resumeRest : pauseRest)}>
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <Button size="lg" variant="rest" onClick={() => apply(endRest)}>
          {done ? 'Close' : 'Skip'}
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
  )
}
