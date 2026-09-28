import { useDeviceState } from '../platform/feedback'
import styles from './FlashOverlay.module.css'

/**
 * A full-screen flash on every completion cue. iOS cannot vibrate from a web
 * app and the silent switch may mute beeps, so the flash is the one cue that
 * always reaches someone glancing at the phone from across the room.
 */
export function FlashOverlay() {
  const flashId = useDeviceState((state) => state.flashId)
  if (flashId === 0) return null
  return <div key={flashId} className={styles.flash} aria-hidden="true" data-testid="cue-flash" />
}
