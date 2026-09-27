import { Button } from '../../components/Button'
import { IconCheck } from '../../components/icons'
import { formatDuration } from '../../domain/format'
import { warmupStepStatus } from '../../domain/progression/warmup'
import { previousWarmupStep, startStrength } from '../../domain/workout/actions'
import { useWorkoutStore } from '../../state/workoutStore'
import styles from './WarmupComplete.module.css'

const STATUS_LABEL = { complete: 'Done', partial: 'Partial', skipped: 'Skipped', untouched: 'Not done' } as const

export function WarmupComplete() {
  const session = useWorkoutStore((state) => state.session)
  const apply = useWorkoutStore((state) => state.apply)
  if (!session) return null
  const steps = session.warmup.filter((step) => step.active)

  return (
    <div className={styles.screen}>
      <div className={styles.content}>
        <div className={styles.badge} aria-hidden="true">
          <IconCheck size={40} />
        </div>
        <h1 className={styles.title}>Warm-up complete</h1>
        <ul className={styles.list}>
          {steps.map((step) => {
            const status = warmupStepStatus(step)
            return (
              <li key={step.stepId} className={`${styles.row} ${styles[status]}`}>
                <span>{step.name}</span>
                <span className={styles.meta}>
                  {formatDuration(step.plannedSec)} · {STATUS_LABEL[status]}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
      <footer className={styles.controls}>
        <Button variant="primary" size="xl" block onClick={() => apply(startStrength)}>
          Start strength workout
        </Button>
        <Button variant="ghost" size="lg" block onClick={() => apply(previousWarmupStep)}>
          Back to warm-up
        </Button>
      </footer>
    </div>
  )
}
