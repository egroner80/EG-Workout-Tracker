import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { useWorkoutStore } from '../../state/workoutStore'
import { RecoveryScreen } from '../recovery/RecoveryScreen'
import { WarmupComplete } from '../warmup/WarmupComplete'
import { WarmupScreen } from '../warmup/WarmupScreen'
import { SoundCheckSheet } from './SoundCheckSheet'
import { StrengthScreen } from './StrengthScreen'
import { WorkoutStatusBars } from './WorkoutStatusBars'
import { useStatusBar } from './useStatusBar'
import styles from './WorkoutRoute.module.css'

/** The active workout: warm-up, the warm-up-complete screen, or the strength cards. */
export function WorkoutRoute() {
  const navigate = useNavigate()
  const session = useWorkoutStore((state) => state.session)
  const recovery = useWorkoutStore((state) => state.recovery)
  const bar = useStatusBar()

  if (recovery) return <RecoveryScreen />
  if (!session?.runtime) {
    return (
      <div className={styles.empty}>
        <h1 className={styles.emptyTitle}>No workout in progress</h1>
        <Button variant="primary" size="lg" onClick={() => navigate('/')}>
          Go to Today
        </Button>
      </div>
    )
  }

  const phase = session.runtime.phase
  const style = { '--status-bar-offset': bar ? '44px' : '0px' } as CSSProperties
  return (
    <div style={style}>
      <WorkoutStatusBars kind={bar} />
      {phase === 'strength' ? <StrengthScreen /> : phase === 'warmup-complete' ? <WarmupComplete /> : <WarmupScreen />}
      <SoundCheckSheet />
    </div>
  )
}
