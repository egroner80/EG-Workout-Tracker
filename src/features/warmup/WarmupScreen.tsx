import { useRef } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { IconChevronLeft, IconChevronRight, IconClose, IconSkip } from '../../components/icons'
import { formatDuration } from '../../domain/format'
import { clamp } from '../../domain/math'
import type { WorkoutSession } from '../../domain/types'
import {
  activeStepIndexes,
  completeRepStep,
  isRepStep,
  nextWarmupStep,
  pauseWarmup,
  previousWarmupStep,
  resumeWarmup,
  sideAt,
  skipWarmup,
  skipWarmupStep,
  startWarmupStep,
  stepWorkMs,
} from '../../domain/workout/actions'
import { remainingMs, secondsLeft } from '../../domain/workout/timer'
import { useClock } from '../../state/useTicker'
import { useWorkoutStore, type WorkoutAction } from '../../state/workoutStore'
import styles from './WarmupScreen.module.css'

/** A second Done this soon after the first is a double tap, not the next drill. */
const DONE_REPEAT_MS = 700

type StepMode = 'get-ready' | 'running' | 'paused' | 'complete' | 'skipped' | 'ready'

const SIDE_LABEL = { L: 'Left side', R: 'Right side' } as const

function stepView(session: WorkoutSession, now: number) {
  const runtime = session.runtime!
  const step = session.warmup[runtime.warmup.index]
  const workMs = stepWorkMs(step)
  const { timer, getReady } = runtime.warmup
  const repStep = isRepStep(step)

  let mode: StepMode
  let remaining = workMs
  if (repStep) {
    // Counted, not timed: it waits for Done unless it is already done or skipped.
    mode = step.completed ? 'complete' : step.skipped ? 'skipped' : 'ready'
  } else if (getReady?.running) {
    mode = 'get-ready'
  } else if (timer) {
    mode = timer.running ? 'running' : 'paused'
    remaining = remainingMs(timer, now)
  } else if (step.elapsedMs > 0 && !step.completed) {
    mode = 'paused'
    remaining = workMs - step.elapsedMs
  } else if (step.completed) {
    mode = 'complete'
  } else if (step.skipped) {
    mode = 'skipped'
  } else {
    mode = 'ready'
  }
  // A per-side step runs one timer across both sides, left first.
  const side = repStep ? undefined : sideAt(step, remaining)
  let caption: string | undefined
  if (repStep) caption = step.perSide ? 'each side' : step.reps === 1 ? 'rep' : 'reps'
  else if (side) caption = mode === 'complete' ? 'each side' : SIDE_LABEL[side]
  const active = activeStepIndexes(session)
  return {
    step,
    mode,
    repStep,
    /** Under the rep count or the countdown: what is counted, the side being worked, or "each side" once done. */
    caption,
    /** The countdown: for a per-side step, what is left of the current side. */
    remaining: side === 'L' ? remaining - step.plannedSec * 1000 : remaining,
    getReadySeconds: getReady ? Math.max(1, secondsLeft(getReady, now)) : 0,
    position: active.indexOf(runtime.warmup.index) + 1,
    total: active.length,
    isFirst: active[0] === runtime.warmup.index,
    // Whole-step progress, across both sides of a per-side step.
    progress: mode === 'complete' ? 1 : repStep ? 0 : 1 - remaining / workMs,
  }
}

export function WarmupScreen() {
  const navigate = useNavigate()
  const session = useWorkoutStore((state) => state.session)
  const applyAction = useWorkoutStore((state) => state.apply)
  const now = useClock((state) => state.now)
  // Consecutive rep steps keep Done in the same place: a second Done right
  // after the first, with no other tap between, is a double tap, not the next drill.
  const lastDoneAt = useRef<number | null>(null)
  if (!session?.runtime) return null

  const apply = (action: WorkoutAction) => {
    lastDoneAt.current = null
    applyAction(action)
  }
  const done = ({ timeStamp }: { timeStamp: number }) => {
    if (lastDoneAt.current !== null && timeStamp - lastDoneAt.current < DONE_REPEAT_MS) return
    lastDoneAt.current = timeStamp
    applyAction(completeRepStep)
  }

  const view = stepView(session, now)
  // A rep step has no timer: Done records it and moves on; once it is done, the button only moves on.
  const primary = view.repStep
    ? view.mode === 'complete'
      ? { label: 'Next', action: () => apply(nextWarmupStep) }
      : { label: 'Done', action: done }
    : {
        'get-ready': { label: 'Cancel', action: () => apply(pauseWarmup) },
        running: { label: 'Pause', action: () => apply(pauseWarmup) },
        paused: { label: 'Resume', action: () => apply(resumeWarmup) },
        complete: { label: 'Start again', action: () => apply(startWarmupStep) },
        skipped: { label: 'Start', action: () => apply(startWarmupStep) },
        ready: { label: 'Start', action: () => apply(startWarmupStep) },
      }[view.mode]

  const status = {
    'get-ready': 'Get ready',
    running: view.step.cue ?? '',
    paused: 'Paused',
    complete: 'Done ✓',
    skipped: 'Skipped',
    ready: view.step.cue ?? '',
  }[view.mode]

  return (
    <div className={`${styles.screen} ${styles[view.mode]}`}>
      <header className={styles.topBar}>
        <button type="button" className={styles.iconButton} onClick={() => navigate('/')} aria-label="Back to Today">
          <IconClose size={24} />
        </button>
        <p className={styles.progress} aria-live="polite">
          {view.position} of {view.total}
        </p>
        <button type="button" className={styles.textButton} onClick={() => apply(skipWarmup)}>
          Skip warm-up
        </button>
      </header>

      <div className={styles.stage}>
        <h1 className={styles.stepName}>{view.step.name}</h1>
        <div className={styles.readout}>
          {view.repStep ? (
            <p className={styles.count}>{view.step.reps}</p>
          ) : view.mode === 'get-ready' ? (
            <p className={styles.getReady} aria-live="assertive" aria-label={`Starting in ${view.getReadySeconds}`}>
              {view.getReadySeconds}
            </p>
          ) : (
            <p className={styles.timer} role="timer" aria-live="off">
              {formatDuration(Math.ceil(view.remaining / 1000))}
            </p>
          )}
          {view.caption && (
            <p className={styles.caption} aria-live="polite">
              {view.caption}
            </p>
          )}
        </div>
        <div className={styles.progressTrack} aria-hidden="true">
          <div className={styles.progressFill} style={{ transform: `scaleX(${clamp(view.progress, 0, 1)})` }} />
        </div>
        <p className={styles.status}>{status}</p>
      </div>

      <footer className={styles.controls}>
        <Button variant={view.mode === 'running' ? 'secondary' : 'primary'} size="xl" block onClick={primary.action}>
          {primary.label}
        </Button>
        <div className={styles.secondaryRow}>
          <Button
            variant="ghost"
            size="lg"
            onClick={() => apply(previousWarmupStep)}
            disabled={view.isFirst}
            icon={<IconChevronLeft size={22} />}
          >
            Previous
          </Button>
          <Button variant="ghost" size="lg" onClick={() => apply(skipWarmupStep)} icon={<IconSkip size={20} />}>
            Skip
          </Button>
          <Button variant="ghost" size="lg" onClick={() => apply(nextWarmupStep)}>
            Next
            <IconChevronRight size={22} />
          </Button>
        </div>
      </footer>
    </div>
  )
}
