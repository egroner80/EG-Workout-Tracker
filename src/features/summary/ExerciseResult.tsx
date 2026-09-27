import { useState } from 'react'
import { Button } from '../../components/Button'
import { Stepper } from '../../components/Stepper'
import { CARRY_MODE_LABEL, formatActual, formatLoad, formatNext, formatPlanned } from '../../domain/format'
import { stepLoad } from '../../domain/load'
import type { ResolvedPrescription } from '../../domain/prescription'
import type { ExerciseLog, Recommendation } from '../../domain/types'
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
        {log.kind === 'carry' && <span className={styles.mode}>{CARRY_MODE_LABEL[log.mode]}</span>}
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

/**
 * Top of the ladder at bodyweight: the app suggests added resistance and the
 * user decides — any change here becomes the next target.
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
  const current = resolved?.prescription.kind === 'reps' ? resolved.prescription : recommendation.prescription
  const [saving, setSaving] = useState(false)
  if (current.kind !== 'reps' || log.kind !== 'reps') return null
  const plannedReps = log.planned.sets.map((s) => s.reps)

  const save = async (loadKg: number, reps: number[]) => {
    setSaving(true)
    try {
      await createOverride(log.exerciseId, { kind: 'reps', loadKg, reps }, Date.now())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.choose}>
      <p className={styles.chooseTitle}>Top of ladder — choose next resistance</p>
      <Stepper
        label="next resistance"
        value={formatLoad(log.loadType, current.loadKg)}
        canDecrement={!saving}
        canIncrement={!saving}
        onDecrement={() => void save(stepLoad(log.loadType, current.loadKg, log.loadStepKg, -1), current.reps)}
        onIncrement={() => void save(stepLoad(log.loadType, current.loadKg, log.loadStepKg, 1), current.reps)}
      />
      <Button size="md" variant="ghost" disabled={saving} onClick={() => void save(log.planned.loadKg, plannedReps)}>
        Stay at {formatLoad(log.loadType, log.planned.loadKg)}
      </Button>
    </div>
  )
}
