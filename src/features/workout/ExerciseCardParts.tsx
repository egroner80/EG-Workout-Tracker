import { Button } from '../../components/Button'
import { IconTimer } from '../../components/icons'
import { formatDuration, formatLoad } from '../../domain/format'
import type { ExerciseLog } from '../../domain/types'
import { startRest } from '../../domain/workout/actions'
import { useWorkoutStore } from '../../state/workoutStore'
import styles from './ExerciseCard.module.css'

/** The top of every exercise card: the name, then the planned load. */
export function ExerciseCardHeader({ log, qualifier }: { log: ExerciseLog; qualifier: string }) {
  return (
    <header className={styles.header}>
      <h1 id={`exercise-${log.exerciseId}`} className={styles.name}>
        {log.name}
      </h1>
      <p className={styles.load}>
        {formatLoad(log.loadType, log.planned.loadKg)}
        {qualifier && <span className={styles.qualifier}>{qualifier}</span>}
      </p>
    </header>
  )
}

export function StartRestButton({ log }: { log: ExerciseLog }) {
  const apply = useWorkoutStore((state) => state.apply)
  return (
    <Button
      variant="rest"
      size="lg"
      block
      icon={<IconTimer size={22} />}
      onClick={() => apply((s, ctx) => startRest(s, log.exerciseId, ctx))}
    >
      Start rest · {formatDuration(log.restSec)}
    </Button>
  )
}
