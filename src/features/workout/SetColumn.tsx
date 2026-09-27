import { RepeatButton } from '../../components/Stepper'
import { IconMinus, IconPlus } from '../../components/icons'
import { formatLoad } from '../../domain/format'
import type { ActualSet, LoadType } from '../../domain/types'
import { chipState } from './cardUtils'
import styles from './SetColumn.module.css'

interface SetColumnProps {
  index: number
  set: ActualSet
  targetReps: number | undefined
  plannedLoad: number
  loadType: LoadType
  onToggle: () => void
  onStep: (delta: 1 | -1) => void
}

/** One set: + above, the tappable rep chip, − below — every control at least 48 px. */
export function SetColumn({ index, set, targetReps, plannedLoad, loadType, onToggle, onStep }: SetColumnProps) {
  const state = chipState(set.status, set.reps, targetReps)
  const number = index + 1
  const statusText = { pending: 'not logged', done: 'done', below: 'below target', skipped: 'skipped' }[state]
  let meta = `set ${number}`
  if (state === 'skipped') meta = 'skipped'
  else if (set.loadKg !== plannedLoad) meta = formatLoad(loadType, set.loadKg)
  else if (state === 'below' && targetReps !== undefined) meta = `of ${targetReps}`
  else if (set.added) meta = 'extra'

  return (
    <div className={styles.column}>
      <RepeatButton label={`Set ${number}: one more rep`} onStep={() => onStep(1)} className={styles.step}>
        <IconPlus size={22} />
      </RepeatButton>
      <button
        type="button"
        className={`${styles.chip} ${styles[state]} ${set.added ? styles.added : ''}`}
        onClick={onToggle}
        aria-pressed={set.status === 'done'}
        aria-label={`Set ${number}: ${set.reps} reps, ${statusText}. Tap to ${set.status === 'done' ? 'undo' : 'log'}.`}
      >
        <span className={styles.reps}>{state === 'skipped' ? '–' : set.reps}</span>
        <span className={styles.meta}>{meta}</span>
      </button>
      <RepeatButton
        label={`Set ${number}: one rep fewer`}
        onStep={() => onStep(-1)}
        disabled={set.reps <= 0}
        className={styles.step}
      >
        <IconMinus size={22} />
      </RepeatButton>
    </div>
  )
}
