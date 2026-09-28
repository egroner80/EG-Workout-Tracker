/** Vibration is progressive enhancement: Android supports it, iOS never has. */

export type HapticPattern = 'complete' | 'switch' | 'go'

const PATTERNS: Record<HapticPattern, number[]> = {
  complete: [220, 90, 220],
  switch: [120, 70, 120, 70, 120],
  go: [70],
}

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

export function vibrate(pattern: HapticPattern): void {
  if (!canVibrate()) return
  try {
    navigator.vibrate(PATTERNS[pattern])
  } catch {
    // Some browsers throw when called without a prior user gesture.
  }
}
