import { Link } from 'react-router'
import { useTargets, type TargetsData } from '../../app/liveData'
import { ScreenHeader } from '../../components/ScreenHeader'
import { IconChevronRight } from '../../components/icons'
import { formatPrescription, formatWarmupTarget } from '../../domain/format'
import { findProgressTarget } from '../../domain/history'
import type { TemplateId } from '../../domain/types'
import { TEMPLATE_IDS, templateLabel } from '../../domain/workouts'
import styles from './Progress.module.css'

/** Both warm-ups open with the jump rope; it has one target and one history. */
const ROPE_ID = 'jump-rope'

/**
 * Each workout's exercises under its type, then the jump rope once. Every
 * entry opens its ladder, charts, and log.
 */
export function ProgressScreen() {
  const upper = useTargets('upper')
  const lower = useTargets('lower')
  if (!upper || !lower) return <div className={styles.loading} aria-busy="true" />
  const workouts: Record<TemplateId, TargetsData> = { upper, lower }
  const rope = findProgressTarget({ upper: upper.template, lower: lower.template }, ROPE_ID)
  const ropeTarget = rope && workouts[rope.templateId].targets.get(ROPE_ID)?.prescription

  return (
    <div className={styles.screen}>
      <ScreenHeader title="Progress" />
      {TEMPLATE_IDS.map((id) => (
        <section key={id} className={styles.section} aria-labelledby={`progress-${id}-heading`}>
          <h2 id={`progress-${id}-heading`} className={styles.sectionTitle}>
            {templateLabel(id)}
          </h2>
          <ul className={styles.list}>
            {workouts[id].template.exercises.map((exercise) => {
              const target = workouts[id].targets.get(exercise.id)
              return (
                <ProgressRow
                  key={exercise.id}
                  targetId={exercise.id}
                  name={exercise.name}
                  value={target ? formatPrescription(target.prescription, exercise.loadType) : ''}
                />
              )
            })}
          </ul>
        </section>
      ))}
      {rope?.kind === 'warmup' && (
        <section className={styles.section} aria-labelledby="progress-warmup-heading">
          <h2 id="progress-warmup-heading" className={styles.sectionTitle}>
            Warm-up
          </h2>
          <ul className={styles.list}>
            <ProgressRow
              targetId={ROPE_ID}
              name={rope.step.name}
              value={ropeTarget?.kind === 'warmup' ? formatWarmupTarget(rope.step, ropeTarget.durationSec) : ''}
            />
          </ul>
        </section>
      )}
    </div>
  )
}

function ProgressRow({ targetId, name, value }: { targetId: string; name: string; value: string }) {
  return (
    <li>
      <Link to={`/progress/${targetId}`} className={styles.row}>
        <span className={styles.name}>{name}</span>
        <span className={styles.value}>{value}</span>
        <IconChevronRight size={18} className={styles.chevron} />
      </Link>
    </li>
  )
}
