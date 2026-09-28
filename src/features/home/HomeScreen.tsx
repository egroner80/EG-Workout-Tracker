import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { formatLongDay, formatDay, formatTime } from '../../app/format'
import { useHasDemo, useMeta, useRecentWorkouts, useTargets } from '../../app/liveData'
import { Button } from '../../components/Button'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { Sheet } from '../../components/Sheet'
import { updateMeta } from '../../data/repositories/settingsRepo'
import { nextTemplateId } from '../../domain/alternation'
import { isStale, pendingExercises } from '../../domain/session'
import type { TemplateId, WorkoutSession } from '../../domain/types'
import { TEMPLATE_IDS, templateLabel, workoutTypeOf } from '../../domain/workouts'
import { feedback } from '../../platform/feedback'
import { clearDemoData } from '../../services/dataCommands'
import type { RecentWorkout } from '../../services/queries'
import { useClock } from '../../state/useTicker'
import { useWorkoutStore } from '../../state/workoutStore'
import { SegmentedControl } from '../settings/SettingsControls'
import { TargetEditorSheet } from '../targets/TargetEditorSheet'
import { DemoBanner } from './DemoBanner'
import styles from './HomeScreen.module.css'
import { InstallTip } from './InstallTip'
import { NextWorkoutList } from './NextWorkoutList'
import { RecentWorkouts } from './RecentWorkouts'

/** The first Home render after launch jumps straight back into a workout in progress. */
let launchRedirectDone = false

/** How many of the newest workouts Home lists; the newest one also decides the suggestion. */
const RECENT_COUNT = 4

const TYPE_OPTIONS = TEMPLATE_IDS.map((id) => ({ value: id, label: templateLabel(id) }))

/** Each workout inside a sentence: "last workout was upper", "Unfinished lower-body workout". */
const IN_SENTENCE: Record<TemplateId, { short: string; adjective: string }> = {
  upper: { short: 'upper', adjective: 'upper-body' },
  lower: { short: 'lower', adjective: 'lower-body' },
}

export function HomeScreen() {
  const navigate = useNavigate()
  const session = useWorkoutStore((state) => state.session)
  const unreadable = useWorkoutStore((state) => state.recovery !== null)
  const busy = useWorkoutStore((state) => state.busy)
  // Both workouts stay loaded, so the switch swaps lists without waiting.
  const targets = { upper: useTargets('upper'), lower: useTargets('lower') }
  const recent = useRecentWorkouts(RECENT_COUNT)
  const meta = useMeta()
  const hasDemo = useHasDemo()
  // A tap on the switch. It lives only as long as Home, so every visit starts from the suggestion.
  const [picked, setPicked] = useState<TemplateId | null>(null)
  // The workout to start once the demo-data choice is made.
  const [demoChoice, setDemoChoice] = useState<TemplateId | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const now = useClock((state) => state.now)
  const stale = session ? isStale(session, now) : false

  // Known at once while a workout is in progress; otherwise once history has loaded.
  const suggested = session || recent ? nextTemplateId(session, recent ?? []) : undefined
  // A workout in progress previews the one after it; otherwise the switch decides.
  const shown = !session && picked ? picked : suggested
  const data = shown && targets[shown]
  // START waits for everything its tap reads, so the demo-data choice is never skipped.
  const ready = data !== undefined && meta !== undefined && hasDemo !== undefined

  useEffect(() => {
    if (launchRedirectDone) return
    launchRedirectDone = true
    // The workout route shows the recovery screen for a stored workout that can't be read.
    if (unreadable || (session && !isStale(session, Date.now()))) navigate('/workout', { replace: true })
  }, [session, unreadable, navigate])

  const start = async (templateId: TemplateId) => {
    setStartError(null)
    try {
      await useWorkoutStore.getState().start(templateId)
      navigate('/workout')
    } catch (error) {
      setStartError(error instanceof Error ? error.message : 'Could not start the workout')
    }
  }

  const onStartTap = (templateId: TemplateId) => {
    // Inside the gesture: unlock audio and keep the screen awake before any awaited work.
    feedback()?.prime()
    if (!meta?.soundCheckDone) feedback()?.testSound()
    if (hasDemo && !meta?.keepDemo) {
      setDemoChoice(templateId)
      return
    }
    void start(templateId)
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
        <h2 id="next-workout-heading" className={styles.sectionTitle}>
          {session ? 'Next workout after this one' : 'Next workout'}
        </h2>
        {shown && data ? (
          <>
            {session ? (
              <p className={styles.caption}>
                <strong>{templateLabel(shown)}</strong> · edit targets after finishing
              </p>
            ) : (
              <>
                <SegmentedControl label="Workout type" value={shown} options={TYPE_OPTIONS} onChange={setPicked} />
                {suggested && <Suggestion suggested={suggested} newest={recent?.[0]} />}
              </>
            )}
            <NextWorkoutList
              template={data.template}
              targets={data.targets}
              onEdit={session ? undefined : setEditing}
            />
          </>
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
          <Button
            variant="primary"
            size="xl"
            block
            onClick={() => {
              if (shown) onStartTap(shown)
            }}
            disabled={busy || !ready || unreadable}
          >
            {shown ? `Start ${templateLabel(shown).toLowerCase()}` : 'Start workout'}
          </Button>
        )}
      </div>

      <RecentWorkouts workouts={recent} />

      <TargetEditorSheet data={data} targetId={editing} onClose={() => setEditing(null)} />

      <Sheet
        open={demoChoice !== null}
        title="Start your first real workout?"
        description="Demo history is still loaded so the charts have something to show. Your targets already come from real workouts only; clearing just tidies History and Progress."
        onClose={() => setDemoChoice(null)}
        footer={
          demoChoice && (
            <>
              <Button
                variant="primary"
                size="lg"
                block
                onClick={() => {
                  feedback()?.prime()
                  setDemoChoice(null)
                  void clearDemoData().then(() => start(demoChoice))
                }}
              >
                Clear demo &amp; start
              </Button>
              <Button
                size="lg"
                block
                onClick={() => {
                  feedback()?.prime()
                  setDemoChoice(null)
                  void updateMeta({ keepDemo: true }).then(() => start(demoChoice))
                }}
              >
                Keep demo &amp; start
              </Button>
            </>
          )
        }
      />
    </div>
  )
}

/** "Suggested: Lower body · last workout was upper, Mon 21 Sep"; the last part keeps to one line. */
function Suggestion({ suggested, newest }: { suggested: TemplateId; newest: RecentWorkout | undefined }) {
  return (
    <p className={styles.caption}>
      Suggested: <strong>{templateLabel(suggested)}</strong>
      {newest && (
        <>
          {' · '}
          <span className={styles.phrase}>
            last workout was {IN_SENTENCE[newest.templateId].short}, {formatDay(newest.startedAt)}
          </span>
        </>
      )}
    </p>
  )
}

function ActiveWorkoutCard({ session, stale }: { session: WorkoutSession; stale: boolean }) {
  const navigate = useNavigate()
  const busy = useWorkoutStore((state) => state.busy)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const type = workoutTypeOf(session)
  const reopened = Boolean(session.reopenSnapshot)
  const status = reopened ? `Editing a finished ${IN_SENTENCE[type].adjective} workout` : `${templateLabel(type)} in progress`
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
            Unfinished {IN_SENTENCE[type].adjective} workout from{' '}
            <span className={styles.phrase}>
              {formatDay(session.startedAt)} {formatTime(session.startedAt)}
            </span>
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
            {status} · <span className={styles.phrase}>started {formatTime(session.startedAt)}</span>
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
