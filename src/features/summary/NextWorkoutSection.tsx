import { formatPrescription, formatWarmupTarget } from '../../domain/format'
import type { ResolvedPrescription } from '../../domain/prescription'
import type { Prescription, WorkoutTemplate } from '../../domain/types'
import { templateLabel } from '../../domain/workouts'
import { applySuggestion } from '../../services/dataCommands'
import styles from './SummaryScreen.module.css'

const same = (a: Prescription | undefined, b: Prescription | undefined) => JSON.stringify(a) === JSON.stringify(b)

interface NextTarget {
  id: string
  name: string
  resolved: ResolvedPrescription
  format: (prescription: Prescription) => string
}

/** Progressive warm-up steps active next time, then every exercise. */
function nextTargets(template: WorkoutTemplate, targets: Map<string, ResolvedPrescription>): NextTarget[] {
  const rows: NextTarget[] = []
  for (const step of template.warmup) {
    const resolved = targets.get(step.id)
    if (resolved?.prescription.kind !== 'warmup' || !resolved.prescription.active) continue
    rows.push({
      id: step.id,
      name: step.name,
      resolved,
      format: (p) => (p.kind === 'warmup' && p.active ? formatWarmupTarget(step, p.durationSec) : formatPrescription(p)),
    })
  }
  for (const exercise of template.exercises) {
    const resolved = targets.get(exercise.id)
    if (!resolved) continue
    rows.push({
      id: exercise.id,
      name: exercise.shortName,
      resolved,
      format: (p) => formatPrescription(p, exercise.loadType),
    })
  }
  return rows
}

/**
 * The NEXT WORKOUT list: the other workout's targets, since the two
 * alternate. Its jump rope is shared with this workout, so it already shows
 * today's result. A manual target that hides a recommendation which has
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
        Next workout · {templateLabel(template.id)}
      </h2>
      <ul className={styles.nextList}>
        {nextTargets(template, targets).map(({ id, name, resolved, format }) => {
          const text = format(resolved.prescription)
          const stale =
            resolved.source === 'override' &&
            resolved.recommendation !== undefined &&
            resolved.override?.replacedRecommendation !== undefined &&
            !same(resolved.override.replacedRecommendation, resolved.recommendation.prescription)
          return (
            <li key={id} className={styles.nextItem}>
              {onEdit ? (
                <button type="button" className={styles.nextRow} onClick={() => onEdit(id)}>
                  <span>{name}</span>
                  <span className={styles.nextValue}>{text}</span>
                </button>
              ) : (
                <div className={styles.nextRow}>
                  <span>{name}</span>
                  <span className={styles.nextValue}>{text}</span>
                </div>
              )}
              {stale && resolved.recommendation && (
                <div className={styles.suggestion}>
                  <span>Manual target kept — suggestion is now {format(resolved.recommendation.prescription)}</span>
                  <button type="button" className={styles.suggestionAction} onClick={() => void applySuggestion(id)}>
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
