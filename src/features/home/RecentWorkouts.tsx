import { Link } from 'react-router'
import { formatDay } from '../../app/format'
import { IconChevronRight } from '../../components/icons'
import { templateLabel } from '../../domain/workouts'
import type { RecentWorkout } from '../../services/queries'
import homeStyles from './HomeScreen.module.css'
import styles from './RecentWorkouts.module.css'

/**
 * The newest finished workouts with their type, each opening its detail.
 * Nothing renders while they load; the section comes last on Home, so its
 * arrival moves nothing above it.
 */
export function RecentWorkouts({ workouts }: { workouts: RecentWorkout[] | undefined }) {
  if (!workouts) return null
  return (
    <section className={homeStyles.section} aria-labelledby="recent-heading">
      <h2 id="recent-heading" className={homeStyles.sectionTitle}>
        Recent
      </h2>
      {workouts.length === 0 ? (
        <p className={styles.empty}>No workouts yet</p>
      ) : (
        <ul className={styles.list}>
          {workouts.map((workout) => (
            <li key={workout.id}>
              <Link to={`/history/${workout.id}`} className={styles.row}>
                <span className={styles.label}>
                  {formatDay(workout.startedAt)} · {templateLabel(workout.templateId)}
                </span>
                <IconChevronRight size={18} className={styles.chevron} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
