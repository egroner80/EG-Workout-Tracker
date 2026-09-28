import { formatShortDate } from '../../app/format'
import { formatLoad } from '../../domain/format'
import type { LadderGroup } from '../../domain/history'
import type { LoadType } from '../../domain/types'
import styles from './LadderView.module.css'

/** Progressive overload at a glance: each load, and the rungs climbed at it. */
export function LadderView({ groups, loadType }: { groups: readonly LadderGroup[]; loadType: LoadType }) {
  if (groups.length === 0) {
    return <p className={styles.empty}>Your ladder starts with the first logged workout.</p>
  }
  return (
    <ol className={styles.groups} aria-label="Progression ladder">
      {groups.map((group) => (
        <li key={`${group.loadKg}-${group.startDate}`} className={styles.group}>
          <p className={styles.load}>
            {formatLoad(loadType, group.loadKg)}
            {group.increased && <span className={styles.up}>↑ from {formatShortDate(group.startDate)}</span>}
          </p>
          <ol className={styles.rungs}>
            {group.rungs.map((rung, index) => (
              <li key={rung.label} className={`${styles.rung} ${rung.completed ? styles.completed : styles.open}`}>
                {index > 0 && (
                  <span className={styles.arrow} aria-hidden="true">
                    ↓
                  </span>
                )}
                <span className={styles.rungRow}>
                  <span className={styles.label}>{rung.label}</span>
                  <span className={styles.meta}>
                    {rung.completed ? '✅' : 'working on it'}
                    {rung.attempts > 1 && ` · ${rung.attempts} tries`}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  )
}
