import type { PersistResult } from '../data/db'

/**
 * Asks the browser not to evict the database. Safari grants this mostly to
 * Home Screen apps; Chrome decides from engagement. The result is shown in Settings.
 */
export async function requestPersistentStorage(): Promise<PersistResult> {
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined
  if (!storage?.persist) return 'unsupported'
  try {
    if (storage.persisted && (await storage.persisted())) return 'granted'
    return (await storage.persist()) ? 'granted' : 'denied'
  } catch {
    return 'denied'
  }
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true
}
