import { Link, Navigate, Route, Routes, useLocation, useOutlet, useParams } from 'react-router'
import { ScreenHeader } from '../../components/ScreenHeader'
import { IconChevronRight } from '../../components/icons'
import type { TemplateId } from '../../domain/types'
import { isTemplateId, TEMPLATE_IDS, templateLabel } from '../../domain/workouts'
import { DataSettings } from './DataSettings'
import { ExerciseEditor } from './ExerciseEditor'
import { ExerciseListEditor } from './ExerciseListEditor'
import { FeedbackSettings } from './FeedbackSettings'
import styles from './Settings.module.css'
import { WarmupEditor } from './WarmupEditor'

export function SettingsScreen() {
  return (
    <Routes>
      <Route index element={<SettingsHome />} />
      <Route path=":templateId" element={<WorkoutSettings />}>
        <Route path="warmup" element={<WarmupEditor />} />
        <Route path="exercises" element={<ExerciseListEditor />} />
        <Route path="exercises/:exerciseId" element={<ExerciseEditor />} />
      </Route>
      <Route path="warmup" element={<ToUpperBody />} />
      <Route path="exercises/*" element={<ToUpperBody />} />
      <Route path="*" element={<Navigate to="/settings" replace />} />
    </Routes>
  )
}

/** One workout's editors; a path naming no known workout, or no editor, goes back to Settings. */
function WorkoutSettings() {
  const { templateId } = useParams()
  const editor = useOutlet()
  return isTemplateId(templateId) && editor ? editor : <Navigate to="/settings" replace />
}

/** Settings paths from before the lower-body workout named no workout; they edited upper body. */
function ToUpperBody() {
  const { pathname } = useLocation()
  return <Navigate to={pathname.replace(/^\/settings/, '/settings/upper')} replace />
}

function SettingsHome() {
  return (
    <div className={styles.screen}>
      <ScreenHeader title="Settings" />
      {TEMPLATE_IDS.map((id) => (
        <WorkoutLinks key={id} templateId={id} />
      ))}
      <FeedbackSettings />
      <DataSettings />
      <p className={styles.version}>Overload {__APP_VERSION__} · all data stays on this device</p>
    </div>
  )
}

function WorkoutLinks({ templateId }: { templateId: TemplateId }) {
  const label = templateLabel(templateId)
  return (
    <section className={styles.section} aria-labelledby={`settings-${templateId}`}>
      <h2 id={`settings-${templateId}`} className={styles.sectionTitle}>
        {label}
      </h2>
      <div className={styles.group}>
        <Link to={`/settings/${templateId}/warmup`} className={styles.linkRow} aria-label={`${label} warm-up`}>
          <span>Warm-up</span>
          <IconChevronRight size={18} />
        </Link>
        <Link
          to={`/settings/${templateId}/exercises`}
          className={styles.linkRow}
          aria-label={`${label} exercises, order, sets, and rest`}
        >
          <span>Exercises, order, sets, and rest</span>
          <IconChevronRight size={18} />
        </Link>
      </div>
    </section>
  )
}
