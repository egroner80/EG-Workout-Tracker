import { Link } from 'react-router'
import { formatDay, formatMinutes, formatTime } from '../../app/format'
import { useHistory } from '../../app/liveData'
import { ScreenHeader } from '../../components/ScreenHeader'
import { IconChevronRight } from '../../components/icons'
import { isMet } from '../../domain/history'
import styles from './History.module.css'

/** Every finished workout, newest first. */
export function HistoryScreen() {
  const sessions = useHistory()
  if (!sessions) return <div className={styles.loading} aria-busy="true" />

  return (
    <div className={styles.screen}>
      <ScreenHeader title="History" />
      {sessions.length === 0 ? (
        <p className={styles.empty}>Finished workouts appear here.</p>
      ) : (
        <ul className={styles.list}>
          {sessions.map((session) => {
            const met = session.exercises.filter((e) => isMet(session.recommendations?.[e.exerciseId])).length
            const duration = (session.finishedAt ?? session.startedAt) - session.startedAt
            return (
              <li key={session.id}>
                <Link to={`/history/${session.id}`} className={styles.row}>
                  <span className={styles.main}>
                    <span className={styles.date}>
                      {formatDay(session.startedAt)}
                      {session.source === 'demo' && <span className={styles.demo}>demo</span>}
                    </span>
                    <span className={styles.meta}>
                      {formatTime(session.startedAt)} · {formatMinutes(duration)} · {met}/{session.exercises.length}{' '}
                      targets met
                    </span>
                  </span>
                  <IconChevronRight size={18} className={styles.chevron} />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
