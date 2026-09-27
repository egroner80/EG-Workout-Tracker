import { useLiveQuery } from 'dexie-react-hooks'
import { getMeta } from '../data/repositories/settingsRepo'
import { hasDemoSessions, listHistory } from '../data/repositories/sessions'
import type { AppMeta } from '../data/db'
import { deriveCurrentPrescriptions, type ResolvedPrescription } from '../domain/prescription'
import type { WorkoutSession, WorkoutTemplate } from '../domain/types'
import { loadPrescriptionContext } from '../services/queries'

/**
 * Live reads for screens other than the active workout. Dexie re-runs them
 * whenever the tables they touch change, so nothing is stale after Finish.
 */

export interface TargetsData {
  template: WorkoutTemplate
  targets: Map<string, ResolvedPrescription>
}

export function useTargets(): TargetsData | undefined {
  return useLiveQuery(async () => {
    const context = await loadPrescriptionContext()
    return { template: context.template, targets: deriveCurrentPrescriptions(context) }
  }, [])
}

export function useMeta(): AppMeta | undefined {
  return useLiveQuery(() => getMeta(), [])
}

export function useHasDemo(): boolean | undefined {
  return useLiveQuery(() => hasDemoSessions(), [])
}

export function useHistory(): WorkoutSession[] | undefined {
  return useLiveQuery(() => listHistory(), [])
}
