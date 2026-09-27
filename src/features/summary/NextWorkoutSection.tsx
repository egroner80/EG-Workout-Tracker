import { formatPrescription } from '../../domain/format'
import type { ResolvedPrescription } from '../../domain/prescription'
import type { Prescription, WorkoutTemplate } from '../../domain/types'
import { applySuggestion } from '../../services/dataCommands'
import styles from './SummaryScreen.module.css'

const same = (a: Prescription | undefined, b: Prescription | undefined) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The NEXT WORKOUT list. A manual target that hides a recommendation which has
 * since changed (a reopened workout was corrected) offers the new suggestion.
 */
export function NextWorkoutSection({
  template,
  targets,
  onEdit,
}: {
  template: WorkoutTemplate
  targets: Map<string, ResolvedPrescription>
  onEdit?: (targetId: string) => void
}) {
  return (
    <section className={styles.nextSection} aria-labelledby="summary-next-heading">
      <h2 id="summary-next-heading" className={styles.nextHeading}>
        Next workout
      </h2>
      <ul className={styles.nextList}>
        {template.exercises.map((exercise) => {
          const resolved = targets.get(exercise.id)
          if (!resolved) return null
          const text = formatPrescription(resolved.prescription, exercise.loadType)
          const stale =
            resolved.source === 'override' &&
            resolved.recommendation !== undefined &&
            resolved.override?.replacedRecommendation !== undefined &&
            !same(resolved.override.replacedRecommendation, resolved.recommendation.prescription)
          return (
            <li key={exercise.id} className={styles.nextItem}>
              {onEdit ? (
                <button type="button" className={styles.nextRow} onClick={() => onEdit(exercise.id)}>
                  <span>{exercise.shortName}</span>
                  <span className={styles.nextValue}>{text}</span>
                </button>
              ) : (
                <div className={styles.nextRow}>
                  <span>{exercise.shortName}</span>
                  <span className={styles.nextValue}>{text}</span>
                </div>
              )}
              {stale && resolved.recommendation && (
                <div className={styles.suggestion}>
                  <span>
                    Manual target kept — suggestion is now{' '}
                    {formatPrescription(resolved.recommendation.prescription, exercise.loadType)}
                  </span>
                  <button type="button" className={styles.suggestionAction} onClick={() => void applySuggestion(exercise.id)}>
                    Use suggestion
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
