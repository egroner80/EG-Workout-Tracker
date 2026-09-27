import { Link } from 'react-router'
import { useTargets } from '../../app/liveData'
import { ScreenHeader } from '../../components/ScreenHeader'
import { IconChevronRight } from '../../components/icons'
import { formatPrescription } from '../../domain/format'
import styles from './Progress.module.css'

/** Every exercise and the jump rope, each opening its ladder, charts, and log. */
export function ProgressScreen() {
  const data = useTargets()
  if (!data) return <div className={styles.loading} aria-busy="true" />
  const rope = data.template.warmup.find((s) => s.id === 'jump-rope')
  const ropeTarget = rope ? data.targets.get(rope.id) : undefined

  return (
    <div className={styles.screen}>
      <ScreenHeader title="Progress" />
      <ul className={styles.list}>
        {data.template.exercises.map((exercise) => {
          const target = data.targets.get(exercise.id)
          return (
            <li key={exercise.id}>
              <Link to={`/progress/${exercise.id}`} className={styles.row}>
                <span className={styles.name}>{exercise.name}</span>
                <span className={styles.value}>
                  {target ? formatPrescription(target.prescription, exercise.loadType) : ''}
                </span>
                <IconChevronRight size={18} className={styles.chevron} />
              </Link>
            </li>
          )
        })}
        {rope && (
          <li>
            <Link to={`/progress/${rope.id}`} className={styles.row}>
              <span className={styles.name}>{rope.name}</span>
              <span className={styles.value}>{ropeTarget ? formatPrescription(ropeTarget.prescription) : ''}</span>
              <IconChevronRight size={18} className={styles.chevron} />
            </Link>
          </li>
        )}
      </ul>
    </div>
  )
}
