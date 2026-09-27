import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { formatLongDay, formatMinutes, formatTime } from '../../app/format'
import { useHistory, useMeta, useTargets } from '../../app/liveData'
import { Button } from '../../components/Button'
import { getSession } from '../../data/repositories/sessions'
import { formatDuration } from '../../domain/format'
import { isProgressiveStep } from '../../domain/progression/warmup'
import type { WarmupStepLog, WorkoutSession } from '../../domain/types'
import { createBackup, recordBackup } from '../../services/dataCommands'
import { useWorkoutStore } from '../../state/workoutStore'
import { shareOrDownloadJson } from '../settings/exportFile'
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
  const session = useLiveQuery(() => getSession(sessionId), [sessionId])
  const history = useHistory()
  const targets = useTargets()
  const meta = useMeta()
  const workoutActive = useWorkoutStore((state) => state.session !== null)
  const [editing, setEditing] = useState<string | null>(null)
  const [backupState, setBackupState] = useState<'idle' | 'working' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

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

  const recommendations = session.recommendations ?? {}
  const latestReal = history?.find((s) => s.source === 'real')
  const canEdit = !workoutActive && session.source === 'real' && latestReal?.id === session.id
  const warmupRecs = session.warmup.filter((step) => isProgressiveStep(step) && recommendations[step.stepId])
  const showBackupReminder =
    session.source === 'real' && (meta?.workoutsSinceBackup ?? 0) >= BACKUP_REMINDER_AFTER && backupState !== 'done'

  const backUp = async () => {
    setBackupState('working')
    const result = await shareOrDownloadJson(`overload-backup-${new Date().toISOString().slice(0, 10)}.json`, await createBackup(Date.now()))
    if (result === 'cancelled') {
      setBackupState('idle')
      return
    }
    await recordBackup(Date.now())
    setBackupState('done')
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
        <h1 className={styles.title}>Workout complete</h1>
        <p className={styles.duration}>Duration: {formatMinutes((session.finishedAt ?? session.startedAt) - session.startedAt)}</p>
      </header>

      {warmupRecs.length > 0 && (
        <section className={styles.block} aria-label="Warm-up">
          <h2 className={styles.blockTitle}>Warm-up</h2>
          {warmupRecs.map((step) => {
            const rec = recommendations[step.stepId]
            const next = rec.prescription.kind === 'warmup' ? rec.prescription : null
            return (
              <p key={step.stepId} className={styles.line}>
                <span>
                  {step.name} {step.active ? formatDuration(step.plannedSec) : ''}
                  {step.completed && ' ✅'}
                </span>
                <span className={styles.next}>
                  {rec.outcome === 'activate'
                    ? `Starts next time at ${formatDuration(next?.durationSec ?? 0)}`
                    : rec.outcome === 'inactive'
                      ? unlockText(session, step)
                      : `Next: ${rec.outcome === 'repeat' ? 'Repeat ' : ''}${formatDuration(next?.durationSec ?? 0)}`}
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
          recommendation={recommendations[log.exerciseId]}
          resolved={targets?.targets.get(log.exerciseId)}
          canChoose={!workoutActive}
        />
      ))}

      {targets && (
        <NextWorkoutSection template={targets.template} targets={targets.targets} onEdit={workoutActive ? undefined : setEditing} />
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

      <TargetEditorSheet targetId={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
