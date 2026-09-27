import { describe, expect, it, vi } from 'vitest'
import { GuardRejection } from '../data/repositories/sessions'
import type { WorkoutSession } from '../domain/types'
import { SaveQueue } from './saveQueue'

const snap = (rev: number) => ({ id: 's1', rev }) as WorkoutSession

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

describe('SaveQueue', () => {
  it('keeps one write in flight and collapses rapid snapshots to the newest', async () => {
    const saved: number[] = []
    let inFlight = 0
    let maxInFlight = 0
    const gate = deferred()
    const queue = new SaveQueue({
      save: async (s) => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        if (s.rev === 1) await gate.promise
        saved.push(s.rev)
        inFlight--
      },
      onRejected: vi.fn(),
      onError: vi.fn(),
    })
    for (let rev = 1; rev <= 20; rev++) queue.enqueue(snap(rev))
    gate.resolve()
    expect(await queue.flush()).toBe(true)
    expect(maxInFlight).toBe(1)
    expect(saved).toEqual([1, 20])
    expect(queue.idle).toBe(true)
  })

  it('retries I/O failures with the newest snapshot', async () => {
    let calls = 0
    const onError = vi.fn()
    const saved: number[] = []
    const queue = new SaveQueue({
      save: async (s) => {
        calls++
        if (calls <= 2) throw new Error('disk I/O')
        saved.push(s.rev)
      },
      onRejected: vi.fn(),
      onError,
      retryDelaysMs: [1],
    })
    queue.enqueue(snap(1))
    expect(await queue.flush()).toBe(true)
    expect(onError).toHaveBeenCalledTimes(2)
    expect(saved).toEqual([1])
  })

  it('does not retry a guard rejection', async () => {
    const onRejected = vi.fn()
    const save = vi.fn(async () => {
      throw new GuardRejection('stale')
    })
    const queue = new SaveQueue({ save, onRejected, onError: vi.fn() })
    queue.enqueue(snap(3))
    await queue.flush()
    expect(save).toHaveBeenCalledTimes(1)
    expect(onRejected).toHaveBeenCalledWith(snap(3), expect.objectContaining({ reason: 'stale' }))
  })

  it('reports a timeout when writes keep failing, and mirrors every snapshot synchronously', async () => {
    const mirror = vi.fn()
    const queue = new SaveQueue({
      save: async () => {
        throw new Error('quota')
      },
      onRejected: vi.fn(),
      onError: vi.fn(),
      retryDelaysMs: [5],
      mirror,
    })
    queue.enqueue(snap(1))
    expect(mirror).toHaveBeenCalledWith(snap(1))
    expect(await queue.flush(30)).toBe(false)
    queue.reset()
  })
})
