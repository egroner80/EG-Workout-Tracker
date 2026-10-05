import { useState } from 'react'
import { belowRangeNote, formatReps } from '../../domain/format'
import type { LastTime as LastTimeData } from '../../domain/prescription'
import type { Outcome, RepsExerciseLog } from '../../domain/types'
import { currentLoad, stepExerciseLoad, stepReps, toggleSet } from '../../domain/workout/actions'
import { useWorkoutStore } from '../../state/workoutStore'
import { loadQualifier } from './cardUtils'
import { EditSetsPanel } from './EditSetsPanel'
import styles from './ExerciseCard.module.css'
import { ExerciseCardHeader, StartRestButton } from './ExerciseCardParts'
import { LastTime } from './LastTime'
import { LoadStepper } from './LoadStepper'
import { SetColumn } from './SetColumn'

const BADGE: Partial<Record<Outcome, string>> = {
  repeat: 'repeat',
  'not-performed': 'repeat',
  advance: 'new rung',
  'increase-load': 'heavier',
}

interface RepsExerciseCardProps {
  log: RepsExerciseLog
  lastTime: LastTimeData | undefined
  previousOutcome: Outcome | undefined
}

export function RepsExerciseCard({ log, lastTime, previousOutcome }: RepsExerciseCardProps) {
  const apply = useWorkoutStore((state) => state.apply)
  const [editing, setEditing] = useState(false)
  const id = log.exerciseId
  const plannedReps = log.planned.sets.map((s) => s.reps)
  const hasPending = log.actual.some((set) => set.status === 'pending')
  const badge = previousOutcome ? BADGE[previousOutcome] : undefined
  const rangeNote = belowRangeNote(plannedReps, log.scheme)

  return (
    <article className={styles.card} aria-labelledby={`exercise-${id}`}>
      <ExerciseCardHeader log={log} qualifier={loadQualifier(log)} />

      <section className={styles.today} aria-label="Today's target">
        <h2 className={styles.label}>
          Today {badge && <span className={styles.badge}>{badge}</span>}
        </h2>
        <p className={styles.targets}>{formatReps(plannedReps)}</p>
        {rangeNote && <p className={styles.rangeNote}>{rangeNote}</p>}
      </section>

      <section className={styles.actual} aria-label="Actual">
        <h2 className={styles.label}>Actual</h2>
        <LoadStepper
          loadType={log.loadType}
          value={currentLoad(log)}
          planned={log.planned.loadKg}
          enabled={hasPending}
          onStep={(direction) => apply((s, ctx) => stepExerciseLoad(s, id, direction, ctx))}
        />
        <div className={styles.sets} role="group" aria-label="Sets">
          {log.actual.map((set, index) => (
            <SetColumn
              key={index}
              index={index}
              set={set}
              targetReps={plannedReps[index]}
              plannedLoad={log.planned.loadKg}
              loadType={log.loadType}
              onToggle={() => apply((s, ctx) => toggleSet(s, id, index, ctx))}
              onStep={(delta) => apply((s, ctx) => stepReps(s, id, index, delta, ctx))}
            />
          ))}
        </div>
        <button type="button" className={styles.linkButton} onClick={() => setEditing((open) => !open)} aria-expanded={editing}>
          {editing ? 'Done editing' : 'Edit sets'}
        </button>
        {editing && <EditSetsPanel log={log} />}
      </section>

      <LastTime lastTime={lastTime} />

      <StartRestButton log={log} />
    </article>
  )
}
