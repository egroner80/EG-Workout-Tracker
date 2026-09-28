import { formatDuration, formatPrescription, formatWarmupTarget } from '../../domain/format'
import type { ResolvedPrescription } from '../../domain/prescription'
import { isProgressiveStep } from '../../domain/progression/warmup'
import type { WorkoutTemplate } from '../../domain/types'
import { IconChevronRight } from '../../components/icons'
import styles from './NextWorkoutList.module.css'
import { warmupPlan } from './warmupPlan'

export interface NextWorkoutListProps {
  template: WorkoutTemplate
  targets: Map<string, ResolvedPrescription>
  /** Opens the target editor; omitted while a workout is in progress (read-only). */
  onEdit?: (targetId: string) => void
}

function badgeFor(resolved: ResolvedPrescription | undefined): string | null {
  if (!resolved) return null
  if (resolved.source === 'override') return 'edited'
  if (resolved.recommendation?.chooseResistance) return 'choose load'
  switch (resolved.recommendation?.outcome) {
    case 'increase-load':
      return 'heavier'
    case 'repeat':
    case 'not-performed':
      return 'repeat'
    default:
      return null
  }
}

export function NextWorkoutList({ template, targets, onEdit }: NextWorkoutListProps) {
  const warmup = warmupPlan(template, targets)
  const warmupTotal = warmup.reduce((sum, entry) => sum + entry.totalSec, 0)
  const progressive = warmup.filter((entry) => isProgressiveStep(entry.step))

  return (
    <ul className={styles.list}>
      <li>
        <Row
          name="Warm-up"
          detail={progressive.map((e) => `${e.step.name} ${formatWarmupTarget(e.step, e.durationSec)}`).join(' · ')}
          value={formatDuration(warmupTotal)}
          onEdit={onEdit && progressive[0] ? () => onEdit(progressive[0].step.id) : undefined}
        />
      </li>
      {template.exercises.map((exercise) => {
        const resolved = targets.get(exercise.id)
        const value = resolved ? formatPrescription(resolved.prescription, exercise.loadType) : '—'
        return (
          <li key={exercise.id}>
            <Row
              name={exercise.shortName}
              value={value}
              badge={badgeFor(resolved)}
              onEdit={onEdit ? () => onEdit(exercise.id) : undefined}
            />
          </li>
        )
      })}
    </ul>
  )
}

function Row({
  name,
  value,
  detail,
  badge,
  onEdit,
}: {
  name: string
  value: string
  detail?: string
  badge?: string | null
  onEdit?: () => void
}) {
  const content = (
    <>
      <span className={styles.name}>
        {name}
        {detail && <span className={styles.detail}>{detail}</span>}
        {badge && <span className={styles.badge}>{badge}</span>}
      </span>
      <span className={styles.value}>{value}</span>
      {onEdit && <IconChevronRight size={18} className={styles.chevron} />}
    </>
  )
  if (!onEdit) return <div className={styles.row}>{content}</div>
  return (
    <button type="button" className={`${styles.row} ${styles.interactive}`} onClick={onEdit} aria-label={`${name}: ${value}. Edit next target`}>
      {content}
    </button>
  )
}
