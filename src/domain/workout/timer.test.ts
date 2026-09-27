import { describe, expect, it } from 'vitest'
import { addTime, isExpired, pauseTimer, remainingMs, resumeTimer, secondsLeft, startTimer } from './timer'

const T0 = 1_000_000

describe('timer math', () => {
  it('counts down from wall-clock time, pauses, and resumes', () => {
    const timer = startTimer(10_000, T0)
    expect(remainingMs(timer, T0 + 4_000)).toBe(6_000)

    const paused = pauseTimer(timer, T0 + 4_000)
    expect(remainingMs(paused, T0 + 100_000)).toBe(6_000)

    const resumed = resumeTimer(paused, T0 + 100_000)
    expect(resumed.endsAt).toBe(T0 + 106_000)
    expect(isExpired(resumed, T0 + 105_999)).toBe(false)
    expect(isExpired(resumed, T0 + 106_000)).toBe(true)
  })

  it('adds time while running or paused and never goes negative', () => {
    const running = addTime(startTimer(10_000, T0), 15_000, T0 + 2_000)
    expect(running.endsAt).toBe(T0 + 25_000)
    expect(remainingMs(running, T0 + 2_000)).toBe(23_000)

    const paused = addTime(pauseTimer(startTimer(10_000, T0), T0 + 2_000), 15_000, T0 + 50_000)
    expect(paused.remainingMs).toBe(23_000)

    expect(remainingMs(startTimer(1_000, T0), T0 + 60_000)).toBe(0)
  })

  it('restarts an already expired timer from now when time is added', () => {
    const expired = startTimer(1_000, T0)
    const extended = addTime(expired, 30_000, T0 + 10_000)
    expect(remainingMs(extended, T0 + 10_000)).toBe(30_000)
  })

  it('clamps remaining time to the duration if the clock moves backwards', () => {
    expect(remainingMs(startTimer(10_000, T0), T0 - 60_000)).toBe(10_000)
  })

  it('shows whole seconds rounded up', () => {
    const timer = startTimer(10_000, T0)
    expect(secondsLeft(timer, T0)).toBe(10)
    expect(secondsLeft(timer, T0 + 4_800)).toBe(6)
    expect(secondsLeft(timer, T0 + 10_000)).toBe(0)
  })
})
