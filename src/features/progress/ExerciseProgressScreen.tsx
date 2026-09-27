import { Link, useParams } from 'react-router'
import { formatShortDate } from '../../app/format'
import { useHistory, useTargets } from '../../app/liveData'
import { ScreenHeader } from '../../components/ScreenHeader'
import { formatDuration, formatKg } from '../../domain/format'
import {
  exerciseRows,
  increaseDates,
  ladderGroups,
  loadSeries,
  volumeSeries,
  warmupSeries,
} from '../../domain/history'
import type { LoadType } from '../../domain/types'
import { LadderView } from './LadderView'
import { LineChart } from './LineChart'
import styles from './Progress.module.css'

function loadAxis(loadType: LoadType) {
  return (kg: number) => (loadType === 'bodyweight' ? (kg === 0 ? 'BW' : `${kg > 0 ? '+' : '−'}${formatKg(Math.abs(kg))}`) : `${formatKg(kg)} kg`)
}

export function ExerciseProgressScreen() {
  const { targetId = '' } = useParams()
  const history = useHistory()
  const data = useTargets()
  if (!history || !data) return <div className={styles.loading} aria-busy="true" />

  const exercise = data.template.exercises.find((e) => e.id === targetId)
  const step = data.template.warmup.find((s) => s.id === targetId)

  if (step && !exercise) {
    const points = warmupSeries(step.id, history)
    return (
      <div className={styles.screen}>
        <ScreenHeader title={step.name} eyebrow="Warm-up" backTo="/progress" backLabel="Progress" />
        <LineChart
          title="Duration per workout"
          points={points}
          formatValue={formatDuration}
          markers={increaseDates(points)}
          markerLabel="Longer"
        />
        <ul className={styles.log} aria-label="Log">
          {[...points].reverse().map((p) => (
            <li key={p.sessionId} className={styles.logRow}>
              <span className={styles.logDate}>{formatShortDate(p.date)}</span>
              <span>{formatDuration(p.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (!exercise) {
    return (
      <div className={styles.screen}>
        <ScreenHeader title="Not found" backTo="/progress" backLabel="Progress" />
      </div>
    )
  }

  const loads = loadSeries(exercise.id, history)
  const volume = volumeSeries(exercise.id, history)
  const rows = exerciseRows(exercise.id, history)
  const isCarry = exercise.kind === 'carry'

  return (
    <div className={styles.screen}>
      <ScreenHeader title={exercise.name} backTo="/progress" backLabel="Progress" />

      <section className={styles.section} aria-labelledby="ladder-heading">
        <h2 id="ladder-heading" className={styles.sectionTitle}>
          Ladder
        </h2>
        <LadderView groups={ladderGroups(exercise.id, history)} loadType={exercise.loadType} />
      </section>

      <LineChart
        title={exercise.loadType === 'dumbbell' ? 'Weight (one dumbbell)' : 'Weight'}
        points={loads}
        formatValue={loadAxis(exercise.loadType)}
        step
        markers={increaseDates(loads)}
        markerLabel="Heavier"
      />
      <LineChart
        title={isCarry ? 'Seconds carried per workout' : 'Total reps per workout'}
        points={volume}
        formatValue={(v) => (isCarry ? `${v} s` : String(v))}
      />

      <section className={styles.section} aria-labelledby="log-heading">
        <h2 id="log-heading" className={styles.sectionTitle}>
          Log
        </h2>
        {rows.length === 0 ? (
          <p className={styles.muted}>No workouts yet.</p>
        ) : (
          <ul className={styles.log}>
            {rows.map((row) => (
              <li key={row.sessionId}>
                <Link to={`/history/${row.sessionId}`} className={styles.logEntry}>
                  <span className={styles.logDate}>
                    {formatShortDate(row.date)}
                    {row.demo && <span className={styles.demo}>demo</span>}
                  </span>
                  <span className={styles.logText}>
                    <span className={styles.logTarget}>Target {row.target}</span>
                    <span>
                      {row.actual} {row.met ? <span aria-label="target met">✅</span> : <span className={styles.repeat}>repeat</span>}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
