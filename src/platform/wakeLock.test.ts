import { describe, expect, it, vi } from 'vitest'
import { createWakeLock } from './wakeLock'

function fakeApi(grant: () => boolean) {
  const sentinels: { released: boolean; release: ReturnType<typeof vi.fn>; addEventListener: ReturnType<typeof vi.fn> }[] = []
  const api = {
    request: vi.fn(async () => {
      if (!grant()) throw new DOMException('Needs a gesture', 'NotAllowedError')
      const sentinel = {
        released: false,
        release: vi.fn(async () => {
          sentinel.released = true
        }),
        addEventListener: vi.fn(),
      }
      sentinels.push(sentinel)
      return sentinel
    }),
  }
  return { api, sentinels }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createWakeLock', () => {
  it('requests the lock when wanted and releases it when no longer wanted', async () => {
    const { api, sentinels } = fakeApi(() => true)
    const needsTap = vi.fn()
    const lock = createWakeLock(needsTap, () => api)
    lock.setWanted(true)
    await flush()
    expect(api.request).toHaveBeenCalledWith('screen')
    expect(needsTap).toHaveBeenLastCalledWith(false)

    lock.setWanted(false)
    expect(sentinels[0].release).toHaveBeenCalled()
  })

  it('asks for a tap after a NotAllowedError and succeeds on the next tap', async () => {
    let allowed = false
    const { api } = fakeApi(() => allowed)
    const needsTap = vi.fn()
    const lock = createWakeLock(needsTap, () => api)
    lock.setWanted(true)
    await flush()
    expect(needsTap).toHaveBeenLastCalledWith(true)

    allowed = true
    lock.onTap()
    await flush()
    expect(needsTap).toHaveBeenLastCalledWith(false)
    expect(api.request).toHaveBeenCalledTimes(2)
  })

  it('re-requests when the page becomes visible after the lock was dropped', async () => {
    const { api, sentinels } = fakeApi(() => true)
    const lock = createWakeLock(vi.fn(), () => api)
    lock.setWanted(true)
    await flush()
    sentinels[0].released = true
    lock.onVisible()
    await flush()
    expect(api.request).toHaveBeenCalledTimes(2)
  })

  it('does nothing when the API is missing', () => {
    const needsTap = vi.fn()
    const lock = createWakeLock(needsTap, () => undefined)
    expect(() => lock.setWanted(true)).not.toThrow()
    expect(needsTap).not.toHaveBeenCalledWith(true)
  })
})
