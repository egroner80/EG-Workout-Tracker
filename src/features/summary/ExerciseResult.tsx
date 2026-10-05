import { useState } from 'react'
import { Button } from '../../components/Button'
import { Stepper } from '../../components/Stepper'
import { CARRY_MODE_LABEL, formatActual, formatLoad, formatNext, formatPlanned } from '../../domain/format'
import { stepLoad } from '../../domain/load'
import type { ResolvedPrescription } from '../../domain/prescription'
import { bottomRung } from '../../domain/progression/staircase'
import type { ExerciseLog, ExercisePrescription, Recommendation } from '../../domain/types'
import { createOverride } from '../../services/dataCommands'
import styles from './SummaryScreen.module.css'
import { isSuccess } from './outcome'

interface ExerciseResultProps {
  log: ExerciseLog
  recommendation: Recommendation | undefined
  /** The current derived target, which reflects any choice made below. */
  resolved: ResolvedPrescription | undefined
  canChoose: boolean
}

/** Target, actual (✅ when met), and next for one exercise. */
export function ExerciseResult({ log, recommendation, resolved, canChoose }: ExerciseResultProps) {
  const success = isSuccess(recommendation)

  return (
    <section className={styles.block} aria-label={log.name}>
      <h2 className={styles.blockTitle}>
        {log.name}
        {/* A hold has no variations to tell apart. */}
        {log.kind === 'carry' && log.style !== 'hold' && (
          <span className={styles.mode}>{CARRY_MODE_LABEL[log.mode]}</span>
        )}
      </h2>
      <p className={styles.line}>
        <span className={styles.lineLabel}>Target</span>
        <span>{formatPlanned(log)}</span>
      </p>
      <p className={`${styles.line} ${success ? styles.success : styles.missed}`}>
        <span className={styles.lineLabel}>Actual</span>
        <span>
          {formatActual(log)} {success && <span aria-label="target met">✅</span>}
        </span>
      </p>
      {recommendation && (
        <p className={styles.line}>
          <span className={styles.lineLabel}>Next</span>
          <span className={styles.next}>{formatNext(recommendation, log.loadType)}</span>
        </p>
      )}
      {recommendation?.chooseResistance && canChoose && (
        <ChooseResistance log={log} recommendation={recommendation} resolved={resolved} />
      )}
    </section>
  )
}

/** The next target at a chosen load. */
function targetAt(log: ExerciseLog, loadKg: number): ExercisePrescription {
  if (log.kind === 'carry') {
    return { kind: 'timed', loadKg, seconds: log.scheme.minSec, setsPerSide: log.scheme.setsPerSide }
  }
  // The top rung was reached by what was actually done, which may be beyond the planned target.
  const reps =
    loadKg === log.planned.loadKg
      ? log.planned.sets.map((s) => Math.max(s.reps, log.scheme.maxReps))
      : bottomRung(log.planned.sets.length, log.scheme.minReps)
  return { kind: 'reps', loadKg, reps }
}

/**
 * Top of the ladder at bodyweight: the app suggests added resistance and the
 * user decides — any change here becomes the next target. A lift repeats the
 * top rung at the load it just finished and restarts at the bottom rung at
 * any other. A timed hold restarts at the bottom of its time range either
 * way; staying at the same load then means a harder lever.
 */
function ChooseResistance({
  log,
  recommendation,
  resolved,
}: {
  log: ExerciseLog
  recommendation: Recommendation
  resolved: ResolvedPrescription | undefined
}) {
  const suggested = recommendation.prescription
  const current = resolved?.prescription.kind === suggested.kind ? resolved.prescription : suggested
  const [saving, setSaving] = useState(false)
  if (current.kind === 'warmup') return null
  const plannedLoad = log.planned.loadKg
  const stay = plannedLoad === 0 ? 'bodyweight' : formatLoad(log.loadType, plannedLoad)

  const save = async (loadKg: number) => {
    setSaving(true)
    try {
      await createOverride(log.exerciseId, targetAt(log, loadKg), Date.now())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.choose}>
      <p className={styles.chooseTitle}>Top of ladder — choose next resistance</p>
      {log.kind === 'carry' && log.style === 'hold' && (
        <p className={styles.chooseNote}>
          Back to {log.scheme.minSec} s per side. To stay at {stay}, use a harder lever.
        </p>
      )}
      <Stepper
        label="next resistance"
        value={formatLoad(log.loadType, current.loadKg)}
        canDecrement={!saving}
        canIncrement={!saving}
        onDecrement={() => void save(stepLoad(log.loadType, current.loadKg, log.loadStepKg, -1))}
        onIncrement={() => void save(stepLoad(log.loadType, current.loadKg, log.loadStepKg, 1))}
      />
      <Button size="md" variant="ghost" disabled={saving} onClick={() => void save(plannedLoad)}>
        Stay at {stay}
      </Button>
    </div>
  )
}
