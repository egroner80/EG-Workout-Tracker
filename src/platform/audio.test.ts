import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAudio } from './audio'

function fakeContext(state: AudioContextState = 'suspended') {
  const ctx = {
    state,
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => {
      ctx.state = 'running'
    }),
    close: vi.fn(async () => {}),
    createBuffer: vi.fn(() => ({})),
    createBufferSource: vi.fn(() => ({ buffer: null, connect: vi.fn(), start: vi.fn() })),
    createOscillator: vi.fn(() => ({ type: 'sine', frequency: { value: 0 }, connect: vi.fn((node) => node), start: vi.fn(), stop: vi.fn() })),
    createGain: vi.fn(() => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    })),
  }
  return ctx
}

afterEach(() => {
  delete (navigator as unknown as { audioSession?: unknown }).audioSession
})

describe('createAudio', () => {
  it('unlocks inside a tap by resuming and playing a silent buffer', () => {
    const ctx = fakeContext()
    const audio = createAudio(() => ctx as unknown as AudioContext)
    audio.unlock()
    expect(ctx.resume).toHaveBeenCalled()
    expect(ctx.createBufferSource).toHaveBeenCalled()
  })

  it('plays tones only while the context runs', async () => {
    const ctx = fakeContext()
    const audio = createAudio(() => ctx as unknown as AudioContext)
    audio.play('complete')
    expect(ctx.createOscillator).not.toHaveBeenCalled()
    audio.unlock()
    await Promise.resolve()
    audio.play('complete')
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2)
  })

  it('switches the Safari audio session for "Always audible" and is a no-op elsewhere', () => {
    const audio = createAudio(() => fakeContext() as unknown as AudioContext)
    expect(() => audio.setAlwaysAudible(true)).not.toThrow()
    const session = { type: 'auto' }
    ;(navigator as unknown as { audioSession: typeof session }).audioSession = session
    audio.setAlwaysAudible(true)
    expect(session.type).toBe('playback')
    audio.setAlwaysAudible(false)
    expect(session.type).toBe('ambient')
  })

  it('replaces a context whose clock is frozen on the next tap', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const contexts = [fakeContext('running'), fakeContext()]
    let created = 0
    const audio = createAudio(() => contexts[created++] as unknown as AudioContext)
    audio.unlock()
    const revive = audio.revive()
    await vi.advanceTimersByTimeAsync(300)
    await revive
    audio.unlock()
    expect(created).toBe(2)
    expect(contexts[0].close).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
