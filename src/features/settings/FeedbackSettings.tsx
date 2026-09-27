import { Button } from '../../components/Button'
import { Toggle } from '../../components/Toggle'
import { feedback } from '../../platform/feedback'
import { canVibrate } from '../../platform/haptics'
import { useWorkoutStore } from '../../state/workoutStore'
import styles from './Settings.module.css'
import { updateSettings } from './settingsActions'

export function FeedbackSettings() {
  const settings = useWorkoutStore((state) => state.settings)
  return (
    <section className={styles.section} aria-labelledby="settings-feedback">
      <h2 id="settings-feedback" className={styles.sectionTitle}>
        Timers &amp; feedback
      </h2>
      <div className={styles.group}>
        <Toggle label="Sound cues" checked={settings.sound} onChange={(sound) => void updateSettings({ sound })} />
        <Toggle
          label="Always audible"
          description="Plays cues even with the silent switch on. Pauses music while the app is open."
          checked={settings.alwaysAudible}
          disabled={!settings.sound}
          onChange={(alwaysAudible) => void updateSettings({ alwaysAudible })}
        />
        {canVibrate() && (
          <Toggle label="Vibration" checked={settings.vibration} onChange={(vibration) => void updateSettings({ vibration })} />
        )}
        <Toggle
          label="3-second get-ready"
          description="Counts down before each warm-up exercise starts."
          checked={settings.getReadyCountdown}
          onChange={(getReadyCountdown) => void updateSettings({ getReadyCountdown })}
        />
        <Toggle
          label="Keep screen on"
          description="During a workout."
          checked={settings.keepScreenAwake}
          onChange={(keepScreenAwake) => void updateSettings({ keepScreenAwake })}
        />
        <div className={styles.inlineRow}>
          <span className={styles.rowLabel}>Theme</span>
          <div className={styles.segmented} role="radiogroup" aria-label="Theme">
            {(['dark', 'light'] as const).map((theme) => (
              <button
                key={theme}
                type="button"
                role="radio"
                aria-checked={settings.theme === theme}
                className={settings.theme === theme ? styles.segmentOn : styles.segment}
                onClick={() => void updateSettings({ theme })}
              >
                {theme === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.inlineRow}>
          <span className={styles.rowLabel}>Check the chime</span>
          <Button size="md" onClick={() => feedback()?.testSound()}>
            Test sound
          </Button>
        </div>
      </div>
    </section>
  )
}
