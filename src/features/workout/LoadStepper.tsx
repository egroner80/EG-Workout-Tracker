import { Stepper } from '../../components/Stepper'
import { formatLoad } from '../../domain/format'
import type { LoadType } from '../../domain/types'
import styles from './LoadStepper.module.css'

interface LoadStepperProps {
  loadType: LoadType
  value: number
  planned: number
  onStep: (direction: 1 | -1) => void
  /** False once every set is logged: the stepper only changes sets not yet done. */
  enabled: boolean
  label?: string
}

export function LoadStepper({ loadType, value, planned, onStep, enabled, label = 'weight' }: LoadStepperProps) {
  const changed = value !== planned
  return (
    <div className={styles.wrap}>
      <Stepper
        label={label}
        value={formatLoad(loadType, value)}
        onDecrement={() => onStep(-1)}
        onIncrement={() => onStep(1)}
        canDecrement={enabled}
        canIncrement={enabled}
        tone={changed ? 'changed' : 'default'}
      />
      {changed && <p className={styles.planned}>planned {formatLoad(loadType, planned)}</p>}
    </div>
  )
}
