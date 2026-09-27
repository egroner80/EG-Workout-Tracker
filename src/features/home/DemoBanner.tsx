import styles from './Banner.module.css'

export function DemoBanner({ onClear }: { onClear: () => void }) {
  return (
    <aside className={styles.banner} aria-label="Demo data">
      <p className={styles.text}>
        <strong>Demo history is loaded</strong> so History and Progress have something to show. Your targets come from
        real workouts only.
      </p>
      <button type="button" className={styles.action} onClick={onClear}>
        Clear demo
      </button>
    </aside>
  )
}
