import { useDeviceState } from '../../platform/feedback'
import { useWorkoutStore } from '../../state/workoutStore'

export type StatusBarKind = 'not-saved' | 'wake-lock' | null

/** One bar at a time: an unsaved workout outranks the keep-awake prompt. */
export function useStatusBar(): StatusBarKind {
  const saveError = useWorkoutStore((state) => state.saveError)
  const keepAwake = useWorkoutStore((state) => state.settings.keepScreenAwake)
  const needsTap = useDeviceState((state) => state.needsTapForWakeLock)
  if (saveError) return 'not-saved'
  if (needsTap && keepAwake) return 'wake-lock'
  return null
}
