import { create } from 'zustand'
import { db } from '../data/db'
import {
  ActiveSessionExistsError,
  getActiveSession,
  getSession,
  insertActiveSession,
  saveActiveSession,
  type GuardRejection,
} from '../data/repositories/sessions'
import { getSettings } from '../data/repositories/settingsRepo'
import { isValidSession } from '../domain/migrate'
import type { PendingResolution } from '../domain/session'
import { DEFAULT_SETTINGS, type AppSettings, type TemplateId, type WorkoutSession } from '../domain/types'
import type { ActionContext, ActionResult } from '../domain/workout/actions'
import { countdownTicks } from '../domain/workout/cues'
import { resync } from '../domain/workout/resync'
import {
  cancelWorkoutEdits,
  discardWorkout,
  finishWorkout,
  reopenWorkout,
  startWorkout,
} from '../services/workoutCommands'
import { workoutEvents, type EventBus } from './events'
import { clearMirror, readMirror, writeMirror } from './mirror'
import { SaveQueue } from './saveQueue'

export type WorkoutAction = (session: WorkoutSession, ctx: ActionContext) => ActionResult

export interface RecoveryState {
  message: string
  raw: unknown
}

export interface WorkoutState {
  status: 'loading' | 'ready'
  session: WorkoutSession | null
  settings: AppSettings
  /** The newest snapshot has not reached IndexedDB yet (shown as "Not saved"). */
  saveError: string | null
  /** A stored workout that failed validation; the recovery screen handles it. */
  recovery: RecoveryState | null
  busy: boolean

  hydrate: () => Promise<void>
  setSettings: (settings: AppSettings) => void
  start: (templateId: TemplateId) => Promise<WorkoutSession>
  apply: (action: WorkoutAction) => void
  tick: (now?: number) => void
  resync: (visible: boolean) => void
  flush: (timeoutMs?: number) => Promise<boolean>
  finish: (resolutions?: Record<string, PendingResolution>, options?: { stale?: boolean }) => Promise<string>
  discard: () => Promise<void>
  reopen: (sessionId: string) => Promise<void>
  cancelEdits: () => Promise<void>
  dismissRecovery: () => Promise<void>
}

export interface WorkoutStoreDeps {
  clock?: () => number
  isVisible?: () => boolean
  events?: EventBus
  /** Persistence for the active workout; injectable so tests can simulate failures. */
  save?: (session: WorkoutSession) => Promise<void>
  retryDelaysMs?: readonly number[]
}

const defaultVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'

/** A second START, Finish, Discard, Reopen, or Cancel edits while one is still running. */
export class StoreBusyError extends Error {
  constructor() {
    super('Still saving. Try again in a moment.')
    this.name = 'StoreBusyError'
  }
}

export class SaveNotConfirmedError extends Error {
  constructor() {
    super('The workout has not been saved yet. Try again in a moment, or export it from the banner.')
    this.name = 'SaveNotConfirmedError'
  }
}

export function createWorkoutStore(deps: WorkoutStoreDeps = {}) {
  const clock = deps.clock ?? (() => Date.now())
  const isVisible = deps.isVisible ?? defaultVisible
  const events = deps.events ?? workoutEvents

  return create<WorkoutState>()((set, get) => {
    // Not store state: the ticker updates it four times a second, and subscribers never read it.
    let lastTickAt = clock()
    const queue = new SaveQueue({
      save: deps.save ?? saveActiveSession,
      mirror: writeMirror,
      ...(deps.retryDelaysMs ? { retryDelaysMs: deps.retryDelaysMs } : {}),
      onSaved: (saved) => {
        if (get().saveError && get().session?.rev === saved.rev) set({ saveError: null })
      },
      onRejected: (snapshot, rejection) => {
        void handleRejection(snapshot, rejection)
      },
      onError: (_snapshot, error) => {
        set({ saveError: error instanceof Error ? error.message : 'Saving failed' })
      },
      recover: async () => {
        if (!db.isOpen()) await db.open()
      },
    })

    async function handleRejection(snapshot: WorkoutSession, rejection: GuardRejection) {
      try {
        if (rejection.reason === 'missing') {
          // The insert never landed (the app died right after START). Restore it if nothing else is active.
          try {
            await insertActiveSession(snapshot)
            set({ saveError: null })
            return
          } catch (error) {
            // Only a workout that already owns the active slot supersedes this one.
            if (!(error instanceof ActiveSessionExistsError)) throw error
          }
        }
        // Another window or a finished transition wrote a newer record: adopt it rather than overwrite it.
        const stored = await getActiveSession()
        if (!stored || stored.id !== get().session?.id) clearMirror()
        set({ session: stored ?? null, saveError: null })
      } catch (error) {
        // Storage failed: keep the workout on screen and in the mirror; the next change tries again.
        set({ saveError: error instanceof Error ? error.message : 'Saving failed' })
      }
    }

    function commit(previous: WorkoutSession, result: ActionResult, now: number) {
      if (result.session !== previous) {
        const next: WorkoutSession = { ...result.session, rev: previous.rev + 1, updatedAt: now }
        set({ session: next })
        queue.enqueue(next)
      }
      events.emit(result.events)
    }

    async function pickHydrationCandidate(): Promise<WorkoutSession | null> {
      const stored = await getActiveSession()
      if (stored && !isValidSession(stored)) {
        set({ recovery: { message: 'The saved workout could not be read.', raw: stored } })
        return null
      }
      const mirror = readMirror()
      if (!mirror) return stored ?? null
      if (stored) {
        if (mirror.id === stored.id && mirror.rev > stored.rev) {
          queue.enqueue(mirror)
          return mirror
        }
        if (mirror.id !== stored.id) clearMirror()
        return stored
      }
      // No active record: only a START whose insert never landed may be restored.
      if (!(await getSession(mirror.id))) {
        try {
          await insertActiveSession(mirror)
          return mirror
        } catch (error) {
          // A storage failure keeps the mirror so the next launch can try again;
          // only a workout that already owns the active slot makes it obsolete.
          if (!(error instanceof ActiveSessionExistsError)) throw error
          clearMirror()
          return null
        }
      }
      clearMirror()
      return null
    }

    return {
      status: 'loading',
      session: null,
      settings: { ...DEFAULT_SETTINGS },
      saveError: null,
      recovery: null,
      busy: false,

      async hydrate() {
        const [settings, candidate] = await Promise.all([getSettings(), pickHydrationCandidate()])
        let session = candidate
        const now = clock()
        if (session) {
          // Resolve anything that ran out while the app was closed, once and silently.
          const resolved = resync(session, { now, visible: false, getReadyCountdown: settings.getReadyCountdown })
          if (resolved.session !== session) {
            session = { ...resolved.session, rev: session.rev + 1, updatedAt: now }
            queue.enqueue(session)
          }
        }
        lastTickAt = now
        set({ status: 'ready', session, settings })
      },

      setSettings(settings) {
        set({ settings })
      },

      async start(templateId) {
        if (get().busy) throw new StoreBusyError()
        set({ busy: true })
        try {
          const session = await startWorkout(templateId, clock())
          writeMirror(session)
          lastTickAt = clock()
          set({ session, saveError: null })
          return session
        } finally {
          set({ busy: false })
        }
      },

      apply(action) {
        const { session, settings, busy } = get()
        if (!session || busy || session.status !== 'active') return
        const now = clock()
        commit(session, action(session, { now, getReadyCountdown: settings.getReadyCountdown }), now)
      },

      tick(now = clock()) {
        const { session, settings, busy } = get()
        const previousTickAt = lastTickAt
        lastTickAt = now
        if (!session || busy || session.status !== 'active') return
        const ticks = countdownTicks(session, previousTickAt, now)
        const result = resync(session, { now, visible: isVisible(), getReadyCountdown: settings.getReadyCountdown })
        commit(session, { session: result.session, events: [...ticks, ...result.events] }, now)
      },

      resync(visible) {
        const { session, settings, busy } = get()
        const now = clock()
        lastTickAt = now
        if (!session || busy || session.status !== 'active') return
        commit(session, resync(session, { now, visible, getReadyCountdown: settings.getReadyCountdown }), now)
      },

      flush(timeoutMs) {
        return queue.flush(timeoutMs)
      },

      async finish(resolutions = {}, options = {}) {
        const { session, busy } = get()
        if (busy) throw new StoreBusyError()
        if (!session) throw new Error('No workout in progress')
        set({ busy: true })
        try {
          const drained = await queue.flush()
          if (!drained || get().saveError) throw new SaveNotConfirmedError()
          const finished = await finishWorkout({
            sessionId: session.id,
            resolutions,
            now: clock(),
            stale: options.stale ?? false,
          })
          queue.reset()
          clearMirror()
          set({ session: null, saveError: null })
          return finished.id
        } finally {
          set({ busy: false })
        }
      },

      async discard() {
        const { session, busy } = get()
        if (busy) throw new StoreBusyError()
        if (!session) return
        set({ busy: true })
        try {
          await queue.flush(3000)
          await discardWorkout(session.id, clock())
          queue.reset()
          clearMirror()
          set({ session: null, saveError: null })
        } finally {
          set({ busy: false })
        }
      },

      async reopen(sessionId) {
        if (get().busy) throw new StoreBusyError()
        set({ busy: true })
        try {
          const reopened = await reopenWorkout(sessionId, clock())
          writeMirror(reopened)
          set({ session: reopened, saveError: null })
        } finally {
          set({ busy: false })
        }
      },

      async cancelEdits() {
        const { session, busy } = get()
        if (busy) throw new StoreBusyError()
        if (!session) return
        set({ busy: true })
        try {
          await queue.flush(3000)
          await cancelWorkoutEdits(session.id, clock())
          queue.reset()
          clearMirror()
          set({ session: null, saveError: null })
        } finally {
          set({ busy: false })
        }
      },

      async dismissRecovery() {
        const { recovery } = get()
        const raw = recovery?.raw as { id?: unknown } | undefined
        if (raw && typeof raw.id === 'string') await db.sessions.delete(raw.id)
        clearMirror()
        set({ recovery: null, session: null })
      },
    }
  })
}

export type WorkoutStore = ReturnType<typeof createWorkoutStore>

export const useWorkoutStore = createWorkoutStore()
