import { useEffect, useRef } from 'react'
import { Button } from '../../components/Button'
import { IconChevronDown, IconChevronRight, IconChevronUp } from '../../components/icons'
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

type Toggle = 'expand' | 'collapse'

/**
 * The toggle that should take focus once the other size has rendered, so a
 * keyboard or screen-reader user isn't dropped when their button unmounts.
 * Only a press of Expand or Collapse sets it; a stale request is ignored.
 */
let pendingFocus: { toggle: Toggle; at: number } | null = null

function requestFocus(toggle: Toggle) {
  pendingFocus = { toggle, at: Date.now() }
}

function takeFocus(toggle: Toggle, element: HTMLElement | null) {
  const pending = pendingFocus
  if (pending?.toggle !== toggle) return
  pendingFocus = null
  if (Date.now() - pending.at < 1000) element?.focus()
}

/** The running rest, as both sizes show it. */
function useRest() {
  const rest = useWorkoutStore((state) => state.session?.runtime?.rest ?? null)
  const apply = useWorkoutStore((state) => state.apply)
  const now = useClock((state) => state.now)
  if (!rest) return null
  const overtimeSec = rest.finishedAt ? Math.floor((now - rest.finishedAt) / 1000) : 0
  const remainingSec = Math.ceil(remainingMs(rest.timer, now) / 1000)
  const paused = !rest.timer.running && !rest.finishedAt
  return {
    rest,
    apply,
    paused,
    display: rest.finishedAt ? `+${formatDuration(overtimeSec)}` : formatDuration(remainingSec),
    label: rest.finishedAt ? 'Rest done' : paused ? 'Rest paused' : 'Rest',
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
  const { rest, apply, display, label } = shown

  return (
    <section className={`${styles.compact} ${rest.finishedAt ? styles.compactDone : ''}`} aria-label="Rest timer">
      <div className={styles.face}>
        <span className={styles.faceTop}>
          <span className={styles.faceLabel}>{label}</span>
          <IconChevronUp size={16} className={styles.faceIcon} />
        </span>
        <span className={styles.faceTime} role="timer" aria-live="off">
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
      <button type="button" className={styles.dismiss} onClick={() => apply((s, ctx) => endRest(s, ctx))}>
        {rest.finishedAt ? 'Close' : 'Skip'}
      </button>
    </section>
  )
}

interface RestTimerSheetProps {
  /** The exercise after the current one, offered once the current one is fully logged. */
  next?: { exerciseId: string; name: string }
}

/**
 * The large rest view, opened from the compact countdown. Touching the card
 * tucks it away again without swallowing that tap, so the next set still
 * logs in one tap.
 */
export function RestTimerSheet({ next }: RestTimerSheetProps) {
  const expanded = useWorkoutStore((state) => state.session?.runtime?.rest?.expanded === true)
  return expanded ? <LargeRestTimer next={next} /> : null
}

function LargeRestTimer({ next }: RestTimerSheetProps) {
  const shown = useRest()
  const exerciseName = useWorkoutStore(
    (state) => state.session?.exercises.find((e) => e.exerciseId === state.session?.runtime?.rest?.exerciseId)?.shortName,
  )
  const collapseRef = useRef<HTMLButtonElement>(null)
  useEffect(() => takeFocus('collapse', collapseRef.current), [])
  if (!shown) return null
  const { rest, apply, paused, display, label } = shown

  return (
    <section className={`${styles.sheet} ${rest.finishedAt ? styles.done : ''}`} aria-label="Rest timer">
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
  )
}
