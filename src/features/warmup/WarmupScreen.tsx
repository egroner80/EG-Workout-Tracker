import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { IconChevronLeft, IconChevronRight, IconClose, IconSkip } from '../../components/icons'
import { formatDuration } from '../../domain/format'
import type { WorkoutSession } from '../../domain/types'
import {
  activeStepIndexes,
  nextWarmupStep,
  pauseWarmup,
  previousWarmupStep,
  resumeWarmup,
  skipWarmup,
  skipWarmupStep,
  startWarmupStep,
} from '../../domain/workout/actions'
import { remainingMs, secondsLeft } from '../../domain/workout/timer'
import { useClock } from '../../state/useTicker'
import { useWorkoutStore } from '../../state/workoutStore'
import styles from './WarmupScreen.module.css'

type StepMode = 'get-ready' | 'running' | 'paused' | 'complete' | 'skipped' | 'ready'

function stepView(session: WorkoutSession, now: number) {
  const runtime = session.runtime!
  const step = session.warmup[runtime.warmup.index]
  const plannedMs = step.plannedSec * 1000
  const { timer, getReady } = runtime.warmup

  let mode: StepMode
  let remaining = plannedMs
  if (getReady?.running) {
    mode = 'get-ready'
  } else if (timer) {
    mode = timer.running ? 'running' : 'paused'
    remaining = remainingMs(timer, now)
  } else if (step.elapsedMs > 0 && !step.completed) {
    mode = 'paused'
    remaining = plannedMs - step.elapsedMs
  } else if (step.completed) {
    mode = 'complete'
  } else if (step.skipped) {
    mode = 'skipped'
  } else {
    mode = 'ready'
  }
  const active = activeStepIndexes(session)
  return {
    step,
    mode,
    remaining,
    getReadySeconds: getReady ? Math.max(1, secondsLeft(getReady, now)) : 0,
    position: active.indexOf(runtime.warmup.index) + 1,
    total: active.length,
    isFirst: active[0] === runtime.warmup.index,
    progress: mode === 'complete' ? 1 : 1 - remaining / plannedMs,
  }
}

export function WarmupScreen() {
  const navigate = useNavigate()
  const session = useWorkoutStore((state) => state.session)
  const apply = useWorkoutStore((state) => state.apply)
  const now = useClock((state) => state.now)
  if (!session?.runtime) return null

  const view = stepView(session, now)
  const primary = {
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

      <main className={styles.stage}>
        <h1 className={styles.stepName}>{view.step.name}</h1>
        {view.mode === 'get-ready' ? (
          <p className={styles.getReady} aria-live="assertive" aria-label={`Starting in ${view.getReadySeconds}`}>
            {view.getReadySeconds}
          </p>
        ) : (
          <p className={styles.timer} role="timer" aria-live="off">
            {formatDuration(Math.ceil(view.remaining / 1000))}
          </p>
        )}
        <div className={styles.progressTrack} aria-hidden="true">
          <div className={styles.progressFill} style={{ transform: `scaleX(${Math.min(1, Math.max(0, view.progress))})` }} />
        </div>
        <p className={styles.status}>{status}</p>
      </main>

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
