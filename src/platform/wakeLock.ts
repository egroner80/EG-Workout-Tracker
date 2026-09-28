/**
 * Keeps the screen on during a workout. The lock drops whenever the page is
 * hidden, and iOS only grants the first request after each page load inside a
 * user gesture; a restored workout therefore asks for a tap until one lands.
 */

interface WakeLockSentinelLike {
  released: boolean
  release: () => Promise<void>
  addEventListener: (type: 'release', listener: () => void) => void
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>
}

export interface WakeLockController {
  /** Whether a workout currently wants the screen kept on. */
  setWanted: (wanted: boolean) => void
  /** Call synchronously inside a tap. */
  onTap: () => void
  onVisible: () => void
}

export function createWakeLock(
  onNeedsTapChange: (needsTap: boolean) => void,
  getWakeLock: () => WakeLockLike | undefined = () =>
    (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock,
): WakeLockController {
  let sentinel: WakeLockSentinelLike | null = null
  let wanted = false
  let pending = false

  const request = () => {
    const api = getWakeLock()
    if (!wanted || pending || (sentinel && !sentinel.released) || !api) return
    pending = true
    api
      .request('screen')
      .then((lock) => {
        sentinel = lock
        lock.addEventListener('release', () => {
          sentinel = null
        })
        onNeedsTapChange(false)
        if (!wanted) void lock.release().catch(() => {})
      })
      .catch(() => {
        // NotAllowedError: iOS wants a user gesture first.
        onNeedsTapChange(wanted)
      })
      .finally(() => {
        pending = false
      })
  }

  return {
    setWanted(next) {
      wanted = next
      if (next) {
        request()
        return
      }
      onNeedsTapChange(false)
      const lock = sentinel
      sentinel = null
      if (lock && !lock.released) void lock.release().catch(() => {})
    },
    onTap: request,
    onVisible: request,
  }
}
