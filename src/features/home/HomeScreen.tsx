import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { formatLongDay, formatDay, formatTime } from '../../app/format'
import { useHasDemo, useMeta, useTargets } from '../../app/liveData'
import { Button } from '../../components/Button'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { Sheet } from '../../components/Sheet'
import { updateMeta } from '../../data/repositories/settingsRepo'
import { isStale, pendingExercises } from '../../domain/session'
import type { WorkoutSession } from '../../domain/types'
import { feedback } from '../../platform/feedback'
import { clearDemoData } from '../../services/dataCommands'
import { useClock } from '../../state/useTicker'
import { useWorkoutStore } from '../../state/workoutStore'
import { TargetEditorSheet } from '../targets/TargetEditorSheet'
import { DemoBanner } from './DemoBanner'
import styles from './HomeScreen.module.css'
import { InstallTip } from './InstallTip'
import { NextWorkoutList } from './NextWorkoutList'

/** The first Home render after launch jumps straight back into a workout in progress. */
let launchRedirectDone = false

export function HomeScreen() {
  const navigate = useNavigate()
  const session = useWorkoutStore((state) => state.session)
  const unreadable = useWorkoutStore((state) => state.recovery !== null)
  const busy = useWorkoutStore((state) => state.busy)
  const data = useTargets('upper')
  const meta = useMeta()
  const hasDemo = useHasDemo()
  const [demoChoiceOpen, setDemoChoiceOpen] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const now = useClock((state) => state.now)
  const stale = session ? isStale(session, now) : false

  useEffect(() => {
    if (launchRedirectDone) return
    launchRedirectDone = true
    // The workout route shows the recovery screen for a stored workout that can't be read.
    if (unreadable || (session && !isStale(session, Date.now()))) navigate('/workout', { replace: true })
  }, [session, unreadable, navigate])

  const start = async () => {
    setStartError(null)
    try {
      await useWorkoutStore.getState().start('upper')
      navigate('/workout')
    } catch (error) {
      setStartError(error instanceof Error ? error.message : 'Could not start the workout')
    }
  }

  const onStartTap = () => {
    // Inside the gesture: unlock audio and keep the screen awake before any awaited work.
    feedback()?.prime()
    if (!meta?.soundCheckDone) feedback()?.testSound()
    if (hasDemo && !meta?.keepDemo) {
      setDemoChoiceOpen(true)
      return
    }
    void start()
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Today</p>
        <h1 className={styles.title}>{formatLongDay(now)}</h1>
      </header>

      {hasDemo && !session && <DemoBanner onClear={() => void clearDemoData()} />}
      {meta && !meta.installTipDismissed && <InstallTip onDismiss={() => void updateMeta({ installTipDismissed: true })} />}

      {session && <ActiveWorkoutCard session={session} stale={stale} />}
      {unreadable && (
        <section className={styles.activeCard} aria-label="Unreadable workout">
          <p className={styles.activeTitle}>A saved workout can’t be opened</p>
          <p className={styles.activeText}>Export a copy or discard it before starting a new workout.</p>
          <div className={styles.activeActions}>
            <Button variant="primary" block onClick={() => navigate('/workout')}>
              Review it
            </Button>
          </div>
        </section>
      )}

      <section className={styles.section} aria-labelledby="next-workout-heading">
        <div className={styles.sectionHeader}>
          <h2 id="next-workout-heading" className={styles.sectionTitle}>
            {session ? 'Next workout after this one' : 'Next workout'}
          </h2>
          {session && <span className={styles.sectionNote}>Edit targets after finishing</span>}
        </div>
        {data ? (
          <NextWorkoutList
            template={data.template}
            targets={data.targets}
            onEdit={session ? undefined : setEditing}
          />
        ) : (
          <div className={styles.placeholder} aria-busy="true" />
        )}
      </section>

      {startError && (
        <p className={styles.error} role="alert">
          {startError}
        </p>
      )}

      <div className={styles.actionBar}>
        {session ? (
          !stale && (
            <Button variant="primary" size="xl" block onClick={() => navigate('/workout')}>
              Resume workout
            </Button>
          )
        ) : (
          <Button variant="primary" size="xl" block onClick={onStartTap} disabled={busy || !data || unreadable}>
            Start workout
          </Button>
        )}
      </div>

      <TargetEditorSheet data={data} targetId={editing} onClose={() => setEditing(null)} />

      <Sheet
        open={demoChoiceOpen}
        title="Start your first real workout?"
        description="Demo history is still loaded so the charts have something to show. Your targets already come from real workouts only; clearing just tidies History and Progress."
        onClose={() => setDemoChoiceOpen(false)}
        footer={
          <>
            <Button
              variant="primary"
              size="lg"
              block
              onClick={() => {
                feedback()?.prime()
                setDemoChoiceOpen(false)
                void clearDemoData().then(start)
              }}
            >
              Clear demo &amp; start
            </Button>
            <Button
              size="lg"
              block
              onClick={() => {
                feedback()?.prime()
                setDemoChoiceOpen(false)
                void updateMeta({ keepDemo: true }).then(start)
              }}
            >
              Keep demo &amp; start
            </Button>
          </>
        }
      />
    </div>
  )
}

function ActiveWorkoutCard({ session, stale }: { session: WorkoutSession; stale: boolean }) {
  const navigate = useNavigate()
  const busy = useWorkoutStore((state) => state.busy)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reopened = Boolean(session.reopenSnapshot)
  const runtime = session.runtime
  const current =
    runtime?.phase === 'strength'
      ? session.exercises.find((e) => e.exerciseId === runtime.currentExerciseId)?.name
      : 'Warm-up'

  /** Runs a store action and shows a failure instead of dropping it. */
  const run = async (action: () => Promise<void>) => {
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work. Try again.')
    }
  }

  const finishWithWhatsLogged = () =>
    run(async () => {
      const resolutions = Object.fromEntries(pendingExercises(session).map((p) => [p.exerciseId, 'skipped' as const]))
      const id = await useWorkoutStore.getState().finish(resolutions, { stale: true })
      navigate(`/summary/${id}`)
    })

  return (
    <section className={styles.activeCard} aria-label="Workout in progress">
      {stale ? (
        <>
          <p className={styles.activeTitle}>
            Unfinished workout from {formatDay(session.startedAt)} {formatTime(session.startedAt)}
          </p>
          <p className={styles.activeText}>Pick up where you left off, save what you logged, or throw it away.</p>
          <div className={styles.activeActions}>
            <Button variant="primary" block onClick={() => navigate('/workout')}>
              Resume
            </Button>
            <Button block disabled={busy} onClick={() => void finishWithWhatsLogged()}>
              Finish &amp; save
            </Button>
            {reopened ? (
              <Button
                variant="ghost"
                block
                disabled={busy}
                onClick={() => void run(() => useWorkoutStore.getState().cancelEdits())}
              >
                Cancel edits
              </Button>
            ) : (
              <Button variant="danger" block disabled={busy} onClick={() => setConfirmDiscard(true)}>
                Discard
              </Button>
            )}
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <>
          <p className={styles.activeTitle}>
            {reopened ? 'Editing a finished workout' : 'Workout in progress'} · started {formatTime(session.startedAt)}
          </p>
          {current && <p className={styles.activeText}>Now: {current}</p>}
        </>
      )}
      <ConfirmSheet
        open={confirmDiscard}
        title="Discard this workout?"
        description="Nothing from it will be saved to History, and your next targets stay as they are."
        confirmLabel="Discard workout"
        onConfirm={() => {
          setConfirmDiscard(false)
          void run(() => useWorkoutStore.getState().discard())
        }}
        onClose={() => setConfirmDiscard(false)}
      />
    </section>
  )
}
