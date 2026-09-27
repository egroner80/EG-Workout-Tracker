import { Button } from '../../components/Button'
import { Stepper } from '../../components/Stepper'
import { IconPlus } from '../../components/icons'
import { formatLoad } from '../../domain/format'
import type { RepsExerciseLog } from '../../domain/types'
import {
  MAX_REST_SEC,
  MIN_REST_SEC,
  addSet,
  deleteAddedSet,
  setRestSec,
  stepSetLoad,
  toggleSkipSet,
} from '../../domain/workout/actions'
import { useWorkoutStore } from '../../state/workoutStore'
import styles from './EditSetsPanel.module.css'

/** Secondary set actions, hidden until asked for: skip, per-set load, delete extras, add, today's rest. */
export function EditSetsPanel({ log }: { log: RepsExerciseLog }) {
  const apply = useWorkoutStore((state) => state.apply)
  const id = log.exerciseId

  return (
    <div className={styles.panel}>
      <ul className={styles.list}>
        {log.actual.map((set, index) => (
          <li key={index} className={styles.row}>
            <span className={styles.setName}>{set.added ? `Extra set ${index + 1}` : `Set ${index + 1}`}</span>
            <Stepper
              size="md"
              label={`set ${index + 1} weight`}
              value={formatLoad(log.loadType, set.loadKg)}
              onDecrement={() => apply((s, ctx) => stepSetLoad(s, id, index, -1, ctx))}
              onIncrement={() => apply((s, ctx) => stepSetLoad(s, id, index, 1, ctx))}
            />
            {set.added ? (
              <Button size="md" variant="danger" onClick={() => apply((s, ctx) => deleteAddedSet(s, id, index, ctx))}>
                Delete
              </Button>
            ) : (
              <Button size="md" onClick={() => apply((s, ctx) => toggleSkipSet(s, id, index, ctx))}>
                {set.status === 'skipped' ? 'Unskip' : 'Skip'}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Button size="md" block icon={<IconPlus size={20} />} onClick={() => apply((s, ctx) => addSet(s, id, ctx))}>
        Add set
      </Button>
      <div className={styles.rest}>
        <span className={styles.setName}>Rest today</span>
        <Stepper
          size="md"
          label="rest time"
          value={`${log.restSec} s`}
          canDecrement={log.restSec > MIN_REST_SEC}
          canIncrement={log.restSec < MAX_REST_SEC}
          onDecrement={() => apply((s, ctx) => setRestSec(s, id, log.restSec - 15, ctx))}
          onIncrement={() => apply((s, ctx) => setRestSec(s, id, log.restSec + 15, ctx))}
        />
      </div>
    </div>
  )
}
