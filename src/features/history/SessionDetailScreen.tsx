import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { formatLongDay, formatMinutes, formatTime } from '../../app/format'
import { Button } from '../../components/Button'
import { ScreenHeader } from '../../components/ScreenHeader'
import { Sheet } from '../../components/Sheet'
import { getSession } from '../../data/repositories/sessions'
import { formatActualCarry, formatActualSets, formatDuration, formatPrescription } from '../../domain/format'
import { isMet } from '../../domain/history'
import { warmupStepStatus } from '../../domain/progression/warmup'
import { deleteWorkout } from '../../services/dataCommands'
import styles from './History.module.css'

const MODE = { carry: 'Carry', march: 'March', hold: 'Static hold' } as const
const STEP_STATUS = { complete: 'done', partial: 'partial', skipped: 'skipped', untouched: 'not done' } as const

export function SessionDetailScreen() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const session = useLiveQuery(() => getSession(sessionId), [sessionId])
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (session === undefined) return <div className={styles.loading} aria-busy="true" />
  if (!session || session.deletedAt !== undefined || session.status !== 'completed') {
    return (
      <div className={styles.screen}>
        <ScreenHeader title="Workout not found" backTo="/history" backLabel="History" />
      </div>
    )
  }

  const duration = (session.finishedAt ?? session.startedAt) - session.startedAt
  const warmup = session.warmup.filter((step) => step.active)

  return (
    <div className={styles.screen}>
      <ScreenHeader
        title={formatLongDay(session.startedAt)}
        eyebrow={session.source === 'demo' ? 'Demo workout' : 'Workout'}
        backTo="/history"
        backLabel="History"
      >
        <p className={styles.meta}>
          Started {formatTime(session.startedAt)} · {formatMinutes(duration)}
        </p>
      </ScreenHeader>

      <section className={styles.card} aria-label="Warm-up">
        <h2 className={styles.cardTitle}>Warm-up</h2>
        {warmup.map((step) => (
          <p key={step.stepId} className={styles.line}>
            <span>{step.name}</span>
            <span className={styles.muted}>
              {formatDuration(step.plannedSec)} · {STEP_STATUS[warmupStepStatus(step)]}
            </span>
          </p>
        ))}
      </section>

      {session.exercises.map((log) => {
        const met = isMet(session.recommendations?.[log.exerciseId])
        const planned =
          log.kind === 'reps'
            ? formatPrescription({ kind: 'reps', loadKg: log.planned.loadKg, reps: log.planned.sets.map((s) => s.reps) }, log.loadType)
            : formatPrescription(
                { kind: 'timed', loadKg: log.planned.loadKg, seconds: log.planned.seconds, setsPerSide: log.scheme.setsPerSide },
                log.loadType,
              )
        const actual = log.kind === 'reps' ? formatActualSets(log.loadType, log.actual) : formatActualCarry(log.loadType, log.actual)
        const skipped = log.actual.filter((set) => set.status === 'skipped').length
        return (
          <section key={log.exerciseId} className={styles.card} aria-label={log.name}>
            <h2 className={styles.cardTitle}>
              {log.name}
              {log.kind === 'carry' && <span className={styles.demo}>{MODE[log.mode]}</span>}
            </h2>
            <p className={styles.line}>
              <span className={styles.label}>Planned</span>
              <span>{planned}</span>
            </p>
            <p className={styles.line}>
              <span className={styles.label}>Actual</span>
              <span className={met ? undefined : styles.warn}>
                {actual} {met && <span aria-label="target met">✅</span>}
              </span>
            </p>
            {skipped > 0 && (
              <p className={styles.line}>
                <span className={styles.label}>Skipped</span>
                <span>
                  {skipped} {skipped === 1 ? 'set' : 'sets'}
                </span>
              </p>
            )}
          </section>
        )
      })}

      <Button variant="ghost" block onClick={() => setConfirmDelete(true)}>
        Delete workout
      </Button>

      <Sheet
        open={confirmDelete}
        title="Delete this workout?"
        description="It disappears from History and Progress. Next targets fall back to your previous workout; manual targets you set stay."
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <Button
              variant="danger"
              block
              onClick={() => {
                setConfirmDelete(false)
                void deleteWorkout(session.id, Date.now()).then(() => navigate('/history'))
              }}
            >
              Delete workout
            </Button>
            <Button block onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </>
        }
      >
        {null}
      </Sheet>
    </div>
  )
}
