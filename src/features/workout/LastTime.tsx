import { formatRelativeDay } from '../../app/format'
import { formatActualCarry, formatActualSets } from '../../domain/format'
import type { LastTime as LastTimeData } from '../../domain/prescription'
import styles from './ExerciseCard.module.css'

export function LastTime({ lastTime }: { lastTime: LastTimeData | undefined }) {
  if (!lastTime) {
    return (
      <p className={styles.lastTime}>
        <span className={styles.label}>Last time</span> <span>First time</span>
      </p>
    )
  }
  const { log, session } = lastTime
  const text =
    log.kind === 'reps' ? formatActualSets(log.loadType, log.actual, ' — ') : formatActualCarry(log.loadType, log.actual)
  return (
    <p className={styles.lastTime}>
      <span className={styles.label}>Last time · {formatRelativeDay(session.startedAt)}</span> <span>{text}</span>
    </p>
  )
}
