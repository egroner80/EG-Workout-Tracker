import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { formatLongDay, formatMinutes, formatTime } from '../../app/format'
import { useMeta, useTargets } from '../../app/liveData'
import { Button } from '../../components/Button'
import { getSession } from '../../data/repositories/sessions'
import { formatDuration, formatWarmupTarget } from '../../domain/format'
import { recommendationFor } from '../../domain/progression/evaluate'
import { isProgressiveStep } from '../../domain/progression/warmup'
import type { WarmupStepLog, WorkoutSession } from '../../domain/types'
import { otherTemplate, templateLabel, workoutTypeOf } from '../../domain/workouts'
import { getLatestRealSession } from '../../services/queries'
import { useWorkoutStore } from '../../state/workoutStore'
import { backUpNow } from '../settings/backupFlow'
import { TargetEditorSheet } from '../targets/TargetEditorSheet'
import { ExerciseResult } from './ExerciseResult'
import { NextWorkoutSection } from './NextWorkoutSection'
import styles from './SummaryScreen.module.css'

/** "Unlocks at 5:00 of jump rope" — the trigger step and threshold come from the step itself. */
function unlockText(session: WorkoutSession, step: WarmupStepLog): string {
  const activation = step.activation
  if (!activation) return 'Not unlocked yet'
  const trigger = session.warmup.find((s) => s.stepId === activation.afterStepId)
  return `Unlocks at ${formatDuration(activation.whenDurationReachesSec)} of ${trigger?.name.toLowerCase() ?? 'its trigger step'}`
}

/** How many real workouts without a backup before the summary nudges one. */
export const BACKUP_REMINDER_AFTER = 5

export function SummaryScreen() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  // A missing workout reads as null so it is told apart from one still loading.
  const session = useLiveQuery(async () => (await getSession(sessionId)) ?? null, [sessionId])

  if (session === undefined) return <div className={styles.loading} aria-busy="true" />
  if (!session || session.status !== 'completed') {
    return (
      <div className={styles.screen}>
        <h1 className={styles.title}>Workout not found</h1>
        <Button variant="primary" onClick={() => navigate('/')}>
          Go to Today
        </Button>
      </div>
    )
  }
  return <Summary key={session.id} session={session} />
}

/**
 * The finished workout against its own targets, then the other workout's
 * targets: the two alternate, so that one comes next.
 */
function Summary({ session }: { session: WorkoutSession }) {
  const navigate = useNavigate()
  const type = workoutTypeOf(session)
  const own = useTargets(type)
  const next = useTargets(otherTemplate(type))
  const latestReal = useLiveQuery(() => getLatestRealSession(), [])
  const meta = useMeta()
  const workoutActive = useWorkoutStore((state) => state.session !== null)
  const [editing, setEditing] = useState<string | null>(null)
  const [backupState, setBackupState] = useState<'idle' | 'working' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  const recommendations = session.recommendations ?? {}
  const canEdit = !workoutActive && session.source === 'real' && latestReal?.id === session.id
  const warmupRecs = session.warmup.filter((step) => isProgressiveStep(step) && recommendations[step.stepId])
  const showBackupReminder =
    session.source === 'real' && (meta?.workoutsSinceBackup ?? 0) >= BACKUP_REMINDER_AFTER && backupState !== 'done'

  const backUp = async () => {
    setBackupState('working')
    const { result } = await backUpNow()
    setBackupState(result === 'cancelled' ? 'idle' : 'done')
  }

  const editWorkout = async () => {
    setError(null)
    try {
      await useWorkoutStore.getState().reopen(session.id)
      navigate('/workout')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reopen the workout')
    }
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{formatLongDay(session.startedAt)} · {formatTime(session.startedAt)}</p>
        <h1 className={styles.title}>{templateLabel(type)} workout complete</h1>
        <p className={styles.duration}>Duration: {formatMinutes((session.finishedAt ?? session.startedAt) - session.startedAt)}</p>
      </header>

      {warmupRecs.length > 0 && (
        <section className={styles.block} aria-label="Warm-up">
          <h2 className={styles.blockTitle}>Warm-up</h2>
          {warmupRecs.map((step) => {
            const rec = recommendations[step.stepId]
            const nextAmount = formatWarmupTarget(step, rec.prescription.kind === 'warmup' ? rec.prescription.durationSec : 0)
            return (
              <p key={step.stepId} className={styles.line}>
                <span>
                  {step.name} {step.active ? formatWarmupTarget(step) : ''}
                  {step.completed && ' ✅'}
                </span>
                <span className={styles.next}>
                  {rec.outcome === 'activate'
                    ? `Starts next time at ${nextAmount}`
                    : rec.outcome === 'inactive'
                      ? unlockText(session, step)
                      : `Next: ${rec.outcome === 'repeat' ? 'Repeat ' : ''}${nextAmount}`}
                </span>
              </p>
            )
          })}
        </section>
      )}

      {session.exercises.map((log) => (
        <ExerciseResult
          key={log.exerciseId}
          log={log}
          recommendation={recommendationFor(session, log.exerciseId)}
          resolved={own?.targets.get(log.exerciseId)}
          canChoose={!workoutActive}
        />
      ))}

      {next && (
        <NextWorkoutSection template={next.template} targets={next.targets} onEdit={workoutActive ? undefined : setEditing} />
      )}

      {showBackupReminder && (
        <section className={styles.backup} aria-label="Backup reminder">
          <p>
            <strong>Back up your history.</strong> It lives only on this phone. Save a copy to Files, iCloud Drive, or
            anywhere you like.
          </p>
          <Button variant="primary" block disabled={backupState === 'working'} onClick={() => void backUp()}>
            Back up now
          </Button>
        </section>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        {canEdit && (
          <Button size="lg" block onClick={() => void editWorkout()}>
            Edit workout
          </Button>
        )}
        <Button variant="primary" size="xl" block onClick={() => navigate('/')}>
          Done
        </Button>
      </div>

      <TargetEditorSheet data={next} targetId={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
