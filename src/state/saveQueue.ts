import { GuardRejection } from '../data/repositories/sessions'
import type { WorkoutSession } from '../domain/types'

export interface SaveQueueOptions {
  save: (session: WorkoutSession) => Promise<void>
  onSaved?: (session: WorkoutSession) => void
  /** The repository refused the snapshot; reload the stored record instead of retrying. */
  onRejected: (session: WorkoutSession, rejection: GuardRejection) => void
  /** An I/O failure; the queue keeps retrying with the newest snapshot. */
  onError: (session: WorkoutSession, error: unknown) => void
  /** Called before a retry, e.g. to reopen a dropped database connection. */
  recover?: () => Promise<void>
  retryDelaysMs?: readonly number[]
  mirror?: (session: WorkoutSession) => void
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * One write in flight and only the newest snapshot waiting. Rapid taps
 * collapse into a single write of the latest state; failed writes retry with
 * whatever snapshot is newest by then.
 */
export class SaveQueue {
  private pending: WorkoutSession | null = null
  private running: Promise<void> | null = null
  private stopped = false
  private readonly options: SaveQueueOptions

  constructor(options: SaveQueueOptions) {
    this.options = options
  }

  enqueue(snapshot: WorkoutSession): void {
    this.options.mirror?.(snapshot)
    this.pending = snapshot
    this.stopped = false
    this.running ??= this.drain()
  }

  get idle(): boolean {
    return this.running === null && this.pending === null
  }

  /** Waits until every queued snapshot is written. Resolves false on timeout. */
  async flush(timeoutMs = 10_000): Promise<boolean> {
    if (!this.running) return true
    const drained = this.running.then(() => true)
    return Promise.race([drained, sleep(timeoutMs).then(() => false)])
  }

  /** Drops queued work, e.g. once a workout is finished or discarded. */
  reset(): void {
    this.pending = null
    this.stopped = true
  }

  private async drain(): Promise<void> {
    const delays = this.options.retryDelaysMs ?? [250, 1000, 3000, 5000]
    try {
      while (this.pending && !this.stopped) {
        const snapshot = this.pending
        this.pending = null
        for (let attempt = 0; ; attempt++) {
          try {
            await this.options.save(snapshot)
            this.options.onSaved?.(snapshot)
            break
          } catch (error) {
            if (error instanceof GuardRejection) {
              this.options.onRejected(snapshot, error)
              break
            }
            this.options.onError(snapshot, error)
            // A newer snapshot supersedes this one; retry with that instead.
            if (this.pending || this.stopped) break
            await this.options.recover?.().catch(() => {})
            await sleep(delays[Math.min(attempt, delays.length - 1)])
            if (this.pending || this.stopped) break
          }
        }
      }
    } finally {
      this.running = null
    }
  }
}
