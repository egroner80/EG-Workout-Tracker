import { Link, Route, Routes } from 'react-router'
import { ScreenHeader } from '../../components/ScreenHeader'
import { IconChevronRight } from '../../components/icons'
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
      <Route path="warmup" element={<WarmupEditor />} />
      <Route path="exercises" element={<ExerciseListEditor />} />
      <Route path="exercises/:exerciseId" element={<ExerciseEditor />} />
    </Routes>
  )
}

function SettingsHome() {
  return (
    <div className={styles.screen}>
      <ScreenHeader title="Settings" />
      <section className={styles.section} aria-labelledby="settings-workout">
        <h2 id="settings-workout" className={styles.sectionTitle}>
          Workout
        </h2>
        <div className={styles.group}>
          <Link to="/settings/warmup" className={styles.linkRow}>
            <span>Warm-up</span>
            <IconChevronRight size={18} />
          </Link>
          <Link to="/settings/exercises" className={styles.linkRow}>
            <span>Exercises, order, sets, and rest</span>
            <IconChevronRight size={18} />
          </Link>
        </div>
      </section>
      <FeedbackSettings />
      <DataSettings />
      <p className={styles.version}>Overload {__APP_VERSION__} · all data stays on this device</p>
    </div>
  )
}
