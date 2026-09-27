import { useState } from 'react'
import { CARRY_MODE_LABEL, formatDuration, formatTimedTarget } from '../../domain/format'
import type { LastTime as LastTimeData } from '../../domain/prescription'
import type { CarryExerciseLog, CarryMode, Outcome } from '../../domain/types'
import {
  adjustEffort,
  currentLoad,
  setCarryMode,
  startEffort,
  stepExerciseLoad,
  toggleSkipEffort,
} from '../../domain/workout/actions'
import { useWorkoutStore } from '../../state/workoutStore'
import styles from './CarryExerciseCard.module.css'
import cardStyles from './ExerciseCard.module.css'
import { ExerciseCardHeader, StartRestButton } from './ExerciseCardParts'
import { chipState } from './cardUtils'
import { LastTime } from './LastTime'
import { LoadStepper } from './LoadStepper'

const MODES: CarryMode[] = ['carry', 'march', 'hold']

const SIDE_NAME = { L: 'Left', R: 'Right' } as const

interface CarryExerciseCardProps {
  log: CarryExerciseLog
  lastTime: LastTimeData | undefined
  previousOutcome: Outcome | undefined
}

export function CarryExerciseCard({ log, lastTime }: CarryExerciseCardProps) {
  const apply = useWorkoutStore((state) => state.apply)
  const [editing, setEditing] = useState(false)
  const id = log.exerciseId
  const sets = Array.from({ length: log.scheme.setsPerSide }, (_, setIndex) => setIndex)
  const hasPending = log.actual.some((effort) => effort.status === 'pending')

  return (
    <article className={cardStyles.card} aria-labelledby={`exercise-${id}`}>
      <ExerciseCardHeader log={log} qualifier="one dumbbell" />

      <div className={styles.modes} role="radiogroup" aria-label="Variation">
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={log.mode === mode}
            className={`${styles.mode} ${log.mode === mode ? styles.modeSelected : ''}`}
            onClick={() => apply((s, ctx) => setCarryMode(s, id, mode, ctx))}
          >
            {CARRY_MODE_LABEL[mode]}
          </button>
        ))}
      </div>

      <section className={cardStyles.today} aria-label="Today's target">
        <h2 className={cardStyles.label}>Today</h2>
        <p className={cardStyles.targets}>{formatTimedTarget(log.planned.seconds, log.scheme.setsPerSide)}</p>
      </section>

      <section className={cardStyles.actual} aria-label="Actual">
        <h2 className={cardStyles.label}>Actual</h2>
        <LoadStepper
          loadType={log.loadType}
          value={currentLoad(log)}
          planned={log.planned.loadKg}
          enabled={hasPending}
          onStep={(direction) => apply((s, ctx) => stepExerciseLoad(s, id, direction, ctx))}
        />
        <div className={styles.grid}>
          <span />
          <span className={styles.sideHeader}>Left</span>
          <span className={styles.sideHeader}>Right</span>
          {sets.map((setIndex) => (
            <div key={setIndex} className={styles.gridRow}>
              <span className={styles.setLabel}>Set {setIndex + 1}</span>
              {(['L', 'R'] as const).map((side) => {
                const effortIndex = log.actual.findIndex((e) => e.side === side && e.setIndex === setIndex)
                const effort = log.actual[effortIndex]
                if (!effort) return <span key={side} />
                const state = chipState(effort.status, effort.seconds, log.planned.seconds)
                const meta = { pending: 'tap to start', done: 'done', below: `of ${log.planned.seconds} s`, skipped: 'skipped' }[state]
                const label = `${SIDE_NAME[side]}, set ${setIndex + 1}`
                return (
                  <div key={side} className={styles.tileWrap}>
                    <button
                      type="button"
                      className={`${styles.tile} ${state === 'pending' ? '' : styles[state]}`}
                      onClick={() => apply((s, ctx) => startEffort(s, id, effortIndex, ctx))}
                      aria-label={`${label}: ${effort.status === 'done' ? `${effort.seconds} seconds recorded` : effort.status}. Tap to start the timer.`}
                    >
                      <span className={styles.tileTime}>
                        {effort.status === 'skipped' ? '–' : formatDuration(effort.seconds)}
                      </span>
                      <span className={styles.tileMeta}>{meta}</span>
                    </button>
                    <div className={styles.adjust}>
                      <button
                        type="button"
                        aria-label={`${label}: 5 seconds less`}
                        onClick={() => apply((s, ctx) => adjustEffort(s, id, effortIndex, -5, ctx))}
                      >
                        −5
                      </button>
                      <button
                        type="button"
                        aria-label={`${label}: 5 seconds more`}
                        onClick={() => apply((s, ctx) => adjustEffort(s, id, effortIndex, 5, ctx))}
                      >
                        +5
                      </button>
                    </div>
                    {editing && (
                      <button
                        type="button"
                        className={styles.skip}
                        onClick={() => apply((s, ctx) => toggleSkipEffort(s, id, effortIndex, ctx))}
                      >
                        {effort.status === 'skipped' ? 'Unskip' : 'Skip'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <button type="button" className={cardStyles.linkButton} onClick={() => setEditing((open) => !open)} aria-expanded={editing}>
          {editing ? 'Done editing' : 'Edit'}
        </button>
      </section>

      <LastTime lastTime={lastTime} />

      <StartRestButton log={log} />
    </article>
  )
}
