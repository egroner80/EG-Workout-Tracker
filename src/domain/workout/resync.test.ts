import { describe, expect, it } from 'vitest'
import { createTemplate } from '../../data/seed/defaultTemplate'
import { buildSession } from '../session'
import type { CarryExerciseLog, WorkoutSession, WorkoutTemplate } from '../types'
import { setRestExpanded, startEffort, startRest, startWarmupStep } from './actions'
import { countdownTicks } from './cues'
import { resync, type ResyncContext } from './resync'

const T0 = Date.UTC(2026, 8, 27, 17, 0)
const live = (now: number): ResyncContext => ({ now, visible: true, getReadyCountdown: true })

function session(): WorkoutSession {
  return buildSession({ id: 's1', now: T0, template: createTemplate('upper'), prescriptions: new Map() })
}

const carry = (s: WorkoutSession) => s.exercises.find((e) => e.kind === 'carry') as CarryExerciseLog

describe('resync — warm-up', () => {
  it('turns an expired get-ready into a running step timed from the countdown end', () => {
    const started = startWarmupStep(session(), { now: T0, getReadyCountdown: true }).session
    const { session: next, events } = resync(started, live(T0 + 3100))
    expect(next.runtime?.warmup.getReady).toBeNull()
    expect(next.runtime?.warmup.timer).toMatchObject({ running: true, endsAt: T0 + 3000 + 120_000 })
    expect(events).toEqual([{ type: 'go' }])
  })

  it('completes a step at zero, cues, advances, and chains into the next get-ready', () => {
    const started = startWarmupStep(session(), { now: T0, getReadyCountdown: false }).session
    const { session: next, events } = resync(started, live(T0 + 120_200))
    expect(next.warmup[0]).toMatchObject({ completed: true, elapsedMs: 120_000 })
    expect(next.runtime?.warmup.index).toBe(2)
    expect(next.runtime?.warmup.getReady).toMatchObject({ running: true, endsAt: T0 + 123_000 })
    expect(events).toEqual([{ type: 'complete' }])
  })

  it('waits for START when the countdown setting is off', () => {
    const started = startWarmupStep(session(), { now: T0, getReadyCountdown: false }).session
    const { session: next } = resync(started, { ...live(T0 + 120_200), getReadyCountdown: false })
    expect(next.runtime?.warmup).toMatchObject({ index: 2, timer: null, getReady: null })
  })

  it('reaches the warm-up-complete state after the last step', () => {
    let s = session()
    s = { ...s, runtime: { ...s.runtime!, warmup: { index: s.warmup.length - 1, timer: null, getReady: null } } }
    s = startWarmupStep(s, { now: T0, getReadyCountdown: false }).session
    const { session: next } = resync(s, live(T0 + 45_100))
    expect(next.runtime?.phase).toBe('warmup-complete')
  })

  it('resolves a step that expired while closed once, silently, without starting the next', () => {
    const started = startWarmupStep(session(), { now: T0, getReadyCountdown: false }).session
    const hidden = { now: T0 + 10 * 60_000, visible: false, getReadyCountdown: true }
    const first = resync(started, hidden)
    expect(first.events).toEqual([])
    expect(first.session.warmup[0].completed).toBe(true)
    expect(first.session.runtime?.warmup).toMatchObject({ index: 2, timer: null, getReady: null })

    const again = resync(first.session, hidden)
    expect(again.session).toBe(first.session)
    expect(again.events).toEqual([])
  })

  it('does not chain when the app returns long after a step ended, even if visible now', () => {
    const started = startWarmupStep(session(), { now: T0, getReadyCountdown: false }).session
    const { session: next, events } = resync(started, live(T0 + 125_000))
    expect(next.runtime?.warmup.getReady).toBeNull()
    expect(events).toEqual([])
  })
})

describe('resync — rest and carry', () => {
  it('keeps a finished rest as overtime and cues only when fresh', () => {
    const resting = startRest(session(), 'db-row', { now: T0, getReadyCountdown: true }).session
    const fresh = resync(resting, live(T0 + 90_300))
    expect(fresh.session.runtime?.rest?.finishedAt).toBe(T0 + 90_000)
    expect(fresh.events).toEqual([{ type: 'complete' }])

    const late = resync(resting, live(T0 + 160_000))
    expect(late.session.runtime?.rest?.finishedAt).toBe(T0 + 90_000)
    expect(late.events).toEqual([])
  })

  it('starts rest compact and keeps whichever size it has when it runs into overtime', () => {
    const resting = startRest(session(), 'db-row', { now: T0, getReadyCountdown: true }).session
    expect(resting.runtime?.rest?.expanded).toBe(false)
    const opened = setRestExpanded(resting, true).session
    expect(resync(opened, live(T0 + 90_300)).session.runtime?.rest).toMatchObject({ expanded: true, finishedAt: T0 + 90_000 })
    expect(resync(resting, live(T0 + 90_300)).session.runtime?.rest).toMatchObject({ expanded: false, finishedAt: T0 + 90_000 })
  })

  it('runs get-ready → left side → switch → right side, then rests', () => {
    let s = startEffort(session(), 'suitcase-carry', 0, { now: T0, getReadyCountdown: true }).session
    let step = resync(s, live(T0 + 5_100))
    expect(step.session.runtime?.effort).toMatchObject({ stage: 'running', effortIndex: 0 })
    expect(step.events).toEqual([{ type: 'go' }])

    step = resync(step.session, live(T0 + 45_100))
    expect(carry(step.session).actual[0]).toMatchObject({ status: 'done', seconds: 40 })
    expect(step.session.runtime?.effort).toMatchObject({ stage: 'switch', effortIndex: 1 })
    expect(step.events).toEqual([{ type: 'switch-sides' }])

    step = resync(step.session, live(T0 + 50_100))
    expect(step.session.runtime?.effort).toMatchObject({ stage: 'running', effortIndex: 1 })

    step = resync(step.session, live(T0 + 90_100))
    expect(carry(step.session).actual[1]).toMatchObject({ status: 'done', seconds: 40 })
    expect(step.session.runtime?.effort).toBeNull()
    expect(step.session.runtime?.rest).toMatchObject({ exerciseId: 'suitcase-carry', expanded: false })
    expect(step.events).toEqual([{ type: 'complete' }])
    s = step.session
    expect(carry(s).actual[2].status).toBe('pending')
  })

  it('does not auto-start the other side while hidden', () => {
    const s = startEffort(session(), 'suitcase-carry', 0, { now: T0, getReadyCountdown: true }).session
    const running = resync(s, live(T0 + 5_100)).session
    const { session: next } = resync(running, { now: T0 + 60_000, visible: false, getReadyCountdown: true })
    expect(carry(next).actual[0].status).toBe('done')
    expect(carry(next).actual[1].status).toBe('pending')
    expect(next.runtime?.effort).toBeNull()
  })
})

describe('countdownTicks', () => {
  it('emits exactly one tick for each of the last three seconds across many frames', () => {
    const s = startRest(session(), 'db-row', { now: T0, getReadyCountdown: true }).session
    const ticks = []
    for (let t = T0 + 85_000; t < T0 + 90_000; t += 250) ticks.push(...countdownTicks(s, t, t + 250))
    expect(ticks).toEqual([
      { type: 'tick', secondsLeft: 3 },
      { type: 'tick', secondsLeft: 2 },
      { type: 'tick', secondsLeft: 1 },
    ])
  })

  it('emits nothing after a long gap', () => {
    const s = startRest(session(), 'db-row', { now: T0, getReadyCountdown: true }).session
    expect(countdownTicks(s, T0, T0 + 89_500)).toEqual([])
  })
})

describe('resync — squat routine and step shapes', () => {
  function lower(stepId: string, template: WorkoutTemplate = createTemplate('lower')): WorkoutSession {
    const s = buildSession({ id: 'l1', now: T0, template, prescriptions: new Map() })
    const index = s.warmup.findIndex((step) => step.stepId === stepId)
    const at = { ...s, runtime: { ...s.runtime!, warmup: { index, timer: null, getReady: null } } }
    return startWarmupStep(at, { now: T0, getReadyCountdown: false }).session
  }
  const indexOf = (s: WorkoutSession, stepId: string) => s.warmup.findIndex((step) => step.stepId === stepId)

  it('flows from one squat-routine hold straight into the next, with a single cue that also flashes', () => {
    const { session: next, events } = resync(lower('deep-squat-hold'), live(T0 + 30_100))
    expect(next.warmup[indexOf(next, 'deep-squat-hold')].completed).toBe(true)
    expect(next.runtime?.warmup).toMatchObject({
      index: indexOf(next, 'deep-squat-knee-push-outs'),
      getReady: null,
      timer: { running: true, endsAt: T0 + 60_000 },
    })
    expect(events).toEqual([{ type: 'complete' }])
  })

  it('flows even with the get-ready setting off', () => {
    const { session: next } = resync(lower('deep-squat-hold'), { ...live(T0 + 30_100), getReadyCountdown: false })
    expect(next.runtime?.warmup.timer).toMatchObject({ running: true, endsAt: T0 + 60_000 })
  })

  it('waits for START when the hold ended while the app was hidden', () => {
    const { session: next, events } = resync(lower('deep-squat-hold'), { now: T0 + 30_100, visible: false, getReadyCountdown: true })
    expect(next.runtime?.warmup).toMatchObject({ index: indexOf(next, 'deep-squat-knee-push-outs'), timer: null, getReady: null })
    expect(events).toEqual([{ type: 'complete' }])
  })

  it('hands the last hold over to the slow squats without starting a timer', () => {
    const { session: next, events } = resync(lower('deep-squat-breathing'), live(T0 + 30_100))
    expect(next.runtime?.warmup).toEqual({ index: indexOf(next, 'slow-squats'), timer: null, getReady: null })
    expect(events).toEqual([{ type: 'complete' }])
  })

  it('uses the normal get-ready when a routine step follows a step outside the routine', () => {
    const template = createTemplate('lower')
    const withoutFirstHold = { ...template, warmup: template.warmup.filter((step) => step.id !== 'deep-squat-hold') }
    const { session: next } = resync(lower('jump-rope', withoutFirstHold), live(T0 + 120_100))
    expect(next.runtime?.warmup).toMatchObject({
      index: indexOf(next, 'deep-squat-knee-push-outs'),
      timer: null,
      getReady: { running: true, endsAt: T0 + 123_000 },
    })

    const split = {
      ...template,
      warmup: template.warmup.flatMap((step) => {
        if (step.id === 'ankle-rocks') return []
        if (step.id === 'deep-squat-hold') return [step, template.warmup.find((s) => s.id === 'ankle-rocks')!]
        return [step]
      }),
    }
    const { session: afterHold } = resync(lower('deep-squat-hold', split), live(T0 + 30_100))
    expect(afterHold.runtime?.warmup).toMatchObject({ index: indexOf(afterHold, 'ankle-rocks'), timer: null })
  })

  it('completes a per-side step only after both sides', () => {
    const started = lower('worlds-greatest-stretch')
    expect(resync(started, live(T0 + 30_100)).session.runtime?.warmup.index).toBe(indexOf(started, 'worlds-greatest-stretch'))
    const { session: next } = resync(started, live(T0 + 60_100))
    expect(next.warmup[indexOf(next, 'worlds-greatest-stretch')]).toMatchObject({ completed: true, elapsedMs: 60_000 })
  })

  it('resolves get-ready, work, and completion in one pass after a long absence, and changes nothing the second time', () => {
    const started = startWarmupStep(session(), { now: T0, getReadyCountdown: true }).session
    const back = live(T0 + 125_000)
    const first = resync(started, back)
    expect(first.session.warmup[0]).toMatchObject({ completed: true, elapsedMs: 120_000 })
    expect(first.session.runtime?.warmup).toEqual({ index: 2, timer: null, getReady: null })
    expect(first.events).toEqual([])
    const second = resync(first.session, back)
    expect(second.session).toEqual(first.session)
    expect(second.events).toEqual([])
  })
})

describe('countdownTicks — per-side steps', () => {
  function stretch(): WorkoutSession {
    const s = buildSession({ id: 'l1', now: T0, template: createTemplate('lower'), prescriptions: new Map() })
    const index = s.warmup.findIndex((step) => step.stepId === 'worlds-greatest-stretch')
    const at = { ...s, runtime: { ...s.runtime!, warmup: { index, timer: null, getReady: null } } }
    return startWarmupStep(at, { now: T0, getReadyCountdown: false }).session
  }

  it('counts 3-2-1 to the side switch and cues it once', () => {
    const s = stretch()
    const events = []
    for (let now = T0 + 26_000; now <= T0 + 31_000; now += 100) events.push(...countdownTicks(s, now - 100, now))
    expect(events).toEqual([
      { type: 'tick', secondsLeft: 3 },
      { type: 'tick', secondsLeft: 2 },
      { type: 'tick', secondsLeft: 1 },
      { type: 'switch-sides' },
    ])
  })

  it('plays nothing when the midpoint passed while the app was hidden', () => {
    expect(countdownTicks(stretch(), T0 + 26_000, T0 + 32_000)).toEqual([])
  })
})
