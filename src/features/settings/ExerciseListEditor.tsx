import { Link } from 'react-router'
import { useTargets } from '../../app/liveData'
import { ScreenHeader } from '../../components/ScreenHeader'
import { IconPlus } from '../../components/icons'
import { formatDuration, formatLoad } from '../../domain/format'
import type { ExerciseDef } from '../../domain/types'
import { templateLabel } from '../../domain/workouts'
import styles from './Settings.module.css'
import { ReorderButtons } from './SettingsControls'
import { moveById, updateTemplate } from './settingsActions'
import { useTemplateParam } from './useTemplateParam'

/** "3 × 5–6 · 1:30 rest" or "2 × 40–60 s per side · 1:00 rest". */
function schemeSummary(exercise: ExerciseDef): string {
  const rest = `${formatDuration(exercise.restSec)} rest`
  if (exercise.kind === 'carry') {
    const { setsPerSide, minSec, maxSec } = exercise.scheme
    return `${setsPerSide} × ${minSec}–${maxSec} s per side · ${rest}`
  }
  const { sets, minReps, maxReps } = exercise.scheme
  return `${sets} × ${minReps}–${maxReps}${exercise.perSide ? ' per side' : ''} · ${rest}`
}

export function ExerciseListEditor() {
  const templateId = useTemplateParam()
  const data = useTargets(templateId)
  if (!data) return <div className={styles.loading} aria-busy="true" />
  const { exercises } = data.template

  return (
    <div className={styles.screen}>
      <ScreenHeader title={`${templateLabel(templateId)} exercises`} backTo="/settings" backLabel="Settings" />
      <p className={styles.note}>Changes apply from your next workout. Removed exercises stay in History.</p>
      <ol className={styles.list}>
        {exercises.map((exercise, index) => {
          const target = data.targets.get(exercise.id)?.prescription
          const load = target && target.kind !== 'warmup' ? formatLoad(exercise.loadType, target.loadKg) : undefined
          return (
            <li key={exercise.id} className={styles.listRow}>
              <Link to={`/settings/${templateId}/exercises/${exercise.id}`} className={styles.listLink}>
                <span className={styles.listName}>{exercise.name}</span>
                <span className={styles.rowHint}>
                  {load ? `${load} · ` : ''}
                  {schemeSummary(exercise)}
                </span>
              </Link>
              <div className={styles.reorder}>
                <ReorderButtons
                  name={exercise.name}
                  first={index === 0}
                  last={index === exercises.length - 1}
                  onMove={(direction) =>
                    void updateTemplate(templateId, (t) => ({ ...t, exercises: moveById(t.exercises, exercise.id, direction) }))
                  }
                />
              </div>
            </li>
          )
        })}
      </ol>
      <Link to={`/settings/${templateId}/exercises/new`} className={styles.addLink}>
        <IconPlus size={20} />
        Add exercise
      </Link>
    </div>
  )
}
