import { describe, expect, it } from 'vitest'
import { createTemplate } from '../../data/seed/defaultTemplate'
import { buildSession } from '../session'
import type { CarryExerciseLog, RepsExerciseLog, WorkoutSession } from '../types'
import {
  addSet,
  currentLoad,
  deleteAddedSet,
  activeStepIndexes,
  completeRepStep,
  nextWarmupStep,
  pauseWarmup,
  previousWarmupStep,
  resumeWarmup,
  setRestSec,
  sideAt,
  skipWarmupStep,
  startEffort,
  startRest,
  startWarmupStep,
  stepExerciseLoad,
  stepWorkMs,
  stepReps,
  stopEffort,
  toggleSet,
  toggleSkipSet,
  type ActionContext,
} from './actions'
import { remainingMs } from './timer'

const T0 = Date.UTC(2026, 8, 27, 17, 0)
const ctx = (now: number, getReadyCountdown = true): ActionContext => ({ now, getReadyCountdown })

function session(): WorkoutSession {
  return buildSession({ id: 's1', now: T0, template: createTemplate('upper'), prescriptions: new Map() })
}

const reps = (s: WorkoutSession, id: string) => s.exercises.find((e) => e.exerciseId === id) as RepsExerciseLog
const carry = (s: WorkoutSession) => s.exercises.find((e) => e.kind === 'carry') as CarryExerciseLog

describe('warm-up actions', () => {
  it('START runs a 3-second get-ready and cues the first tick', () => {
    const { session: next, events } = startWarmupStep(session(), ctx(T0))
    expect(next.runtime?.warmup.getReady).toMatchObject({ durationMs: 3000, running: true })
    expect(next.runtime?.warmup.timer).toBeNull()
    expect(events).toEqual([{ type: 'tick', secondsLeft: 3 }])
  })

  it('START without the countdown runs the step immediately', () => {
    const { session: next, events } = startWarmupStep(session(), ctx(T0, false))
    expect(next.runtime?.warmup.timer).toMatchObject({ durationMs: 120_000, running: true, endsAt: T0 + 120_000 })
    expect(events).toEqual([{ type: 'go' }])
  })

  it('PAUSE records elapsed time and RESUME continues from it', () => {
    let s = startWarmupStep(session(), ctx(T0, false)).session
    s = pauseWarmup(s, ctx(T0 + 30_000)).session
    expect(s.warmup[0].elapsedMs).toBe(30_000)
    s = resumeWarmup(s, ctx(T0 + 90_000)).session
    expect(remainingMs(s.runtime!.warmup.timer!, T0 + 90_000)).toBe(90_000)
  })

  it('Next pauses a running step and keeps its elapsed time; returning resumes it', () => {
    let s = startWarmupStep(session(), ctx(T0, false)).session
    s = nextWarmupStep(s, ctx(T0 + 40_000)).session
    expect(s.warmup[0]).toMatchObject({ elapsedMs: 40_000, completed: false })
    expect(s.runtime?.warmup.index).toBe(2) // double unders (index 1) is inactive
    expect(s.runtime?.warmup.timer).toBeNull()

    s = previousWarmupStep(s, ctx(T0 + 50_000)).session
    expect(s.runtime?.warmup.index).toBe(0)
    s = resumeWarmup(s, ctx(T0 + 60_000)).session
    expect(remainingMs(s.runtime!.warmup.timer!, T0 + 60_000)).toBe(80_000)
  })

  it('Next on an untouched step leaves it untouched', () => {
    const s = nextWarmupStep(session(), ctx(T0)).session
    expect(s.warmup[0]).toMatchObject({ elapsedMs: 0, completed: false, skipped: false })
  })

  it('Skip marks the step skipped and lands on the next one unstarted', () => {
    const s = skipWarmupStep(session(), ctx(T0)).session
    expect(s.warmup[0].skipped).toBe(true)
    expect(s.runtime?.warmup).toMatchObject({ index: 2, timer: null, getReady: null })
  })

  it('skipping the last active step completes the warm-up', () => {
    let s = session()
    const steps = activeStepIndexes(s).length
    for (let i = 0; i < steps; i++) s = skipWarmupStep(s, ctx(T0 + i)).session
    expect(s.runtime?.phase).toBe('warmup-complete')
  })
})

describe('set logging', () => {
  it('tapping a pending set marks it done and starts a compact rest; tapping again undoes both', () => {
    let s = toggleSet(session(), 'db-row', 0, ctx(T0)).session
    expect(reps(s, 'db-row').actual[0].status).toBe('done')
    expect(s.runtime?.rest).toMatchObject({ exerciseId: 'db-row', startedBySet: 0, expanded: false })
    expect(s.runtime?.rest?.timer.durationMs).toBe(90_000)

    s = toggleSet(s, 'db-row', 0, ctx(T0 + 1000)).session
    expect(reps(s, 'db-row').actual[0].status).toBe('pending')
    expect(s.runtime?.rest).toBeNull()
  })

  it('stepping reps changes actual only, logs the set, and starts rest once', () => {
    let s = stepReps(session(), 'db-row', 2, -1, ctx(T0)).session
    const row = reps(s, 'db-row')
    expect(row.actual[2]).toMatchObject({ reps: 3, status: 'done' })
    expect(row.planned.sets[2].reps).toBe(4)
    expect(s.runtime?.rest).toMatchObject({ startedBySet: 2, expanded: false })
    const restEndsAt = s.runtime?.rest?.timer.endsAt

    s = stepReps(s, 'db-row', 2, -1, ctx(T0 + 5000)).session
    expect(reps(s, 'db-row').actual[2].reps).toBe(2)
    expect(s.runtime?.rest?.timer.endsAt).toBe(restEndsAt)
  })

  it('the load stepper changes only sets not yet done', () => {
    let s = toggleSet(session(), 'db-row', 0, ctx(T0)).session
    s = toggleSet(s, 'db-row', 1, ctx(T0 + 1)).session
    s = stepExerciseLoad(s, 'db-row', -1, ctx(T0 + 2)).session
    expect(reps(s, 'db-row').actual.map((set) => set.loadKg)).toEqual([18, 18, 16])
    expect(currentLoad(reps(s, 'db-row'))).toBe(16)
  })

  it('moves a bodyweight load through bodyweight, added, and assisted', () => {
    let s = stepExerciseLoad(session(), 'pull-ups', 1, ctx(T0)).session
    expect(reps(s, 'pull-ups').actual[0].loadKg).toBe(2.5)
    s = stepExerciseLoad(s, 'pull-ups', -1, ctx(T0)).session
    s = stepExerciseLoad(s, 'pull-ups', -1, ctx(T0)).session
    expect(reps(s, 'pull-ups').actual[0].loadKg).toBe(-2.5)
  })

  it('adds, deletes, and skips sets without touching planned sets', () => {
    let s = addSet(session(), 'dips', ctx(T0)).session
    expect(reps(s, 'dips').actual).toHaveLength(4)
    expect(reps(s, 'dips').actual[3]).toMatchObject({ added: true, status: 'pending' })

    expect(deleteAddedSet(s, 'dips', 0, ctx(T0)).session).toBe(s)
    s = deleteAddedSet(s, 'dips', 3, ctx(T0)).session
    expect(reps(s, 'dips').actual).toHaveLength(3)

    s = toggleSkipSet(s, 'dips', 1, ctx(T0)).session
    expect(reps(s, 'dips').actual[1].status).toBe('skipped')
    s = toggleSkipSet(s, 'dips', 1, ctx(T0)).session
    expect(reps(s, 'dips').actual[1].status).toBe('pending')
  })

  it("changes today's rest time for one exercise", () => {
    let s = setRestSec(session(), 'db-row', 105, ctx(T0)).session
    expect(reps(s, 'db-row').restSec).toBe(105)
    s = startRest(s, 'db-row', ctx(T0)).session
    expect(s.runtime?.rest?.timer.durationMs).toBe(105_000)
  })
})

describe('carry efforts', () => {
  it('starting an effort cancels a running rest and opens a 5-second get-ready', () => {
    let s = startRest(session(), 'reverse-crunch', ctx(T0)).session
    s = startEffort(s, 'suitcase-carry', 0, ctx(T0 + 1000)).session
    expect(s.runtime?.rest).toBeNull()
    expect(s.runtime?.effort).toMatchObject({ effortIndex: 0, stage: 'get-ready' })
    expect(s.runtime?.effort?.timer.durationMs).toBe(5000)
  })

  it('Stop during the get-ready records nothing; Stop while running records elapsed seconds', () => {
    const start = startEffort(session(), 'suitcase-carry', 0, ctx(T0)).session
    const cancelled = stopEffort(start, ctx(T0 + 2000)).session
    expect(carry(cancelled).actual[0].status).toBe('pending')

    const running: WorkoutSession = {
      ...start,
      runtime: {
        ...start.runtime!,
        effort: { ...start.runtime!.effort!, stage: 'running', timer: { durationMs: 40_000, running: true, endsAt: T0 + 40_000, remainingMs: 40_000 } },
      },
    }
    const stopped = stopEffort(running, ctx(T0 + 32_500)).session
    expect(carry(stopped).actual[0]).toMatchObject({ seconds: 32, status: 'done' })
    expect(stopped.runtime?.effort).toBeNull()
  })
})

describe('rep-counted and per-side warm-up steps', () => {
  function lower(stepId: string, template = createTemplate('lower')): WorkoutSession {
    const s = buildSession({ id: 'l1', now: T0, template, prescriptions: new Map() })
    const index = s.warmup.findIndex((step) => step.stepId === stepId)
    return { ...s, runtime: { ...s.runtime!, warmup: { index, timer: null, getReady: null } } }
  }
  const indexOf = (s: WorkoutSession, stepId: string) => s.warmup.findIndex((step) => step.stepId === stepId)

  it('Done completes a rep step and moves on in one tap, with no timer before another rep step', () => {
    const { session: s, events } = completeRepStep(lower('hip-hinges'), ctx(T0))
    expect(s.warmup[indexOf(s, 'hip-hinges')]).toMatchObject({ completed: true, skipped: false, elapsedMs: 30_000 })
    expect(s.runtime?.warmup).toEqual({ index: indexOf(s, 'bw-split-squats'), timer: null, getReady: null })
    expect(events).toEqual([])
  })

  it('counts in the next timed step when the get-ready setting is on, and waits for START when it is off', () => {
    const on = completeRepStep(lower('slow-squats'), ctx(T0))
    expect(on.session.runtime?.warmup.index).toBe(indexOf(on.session, 'ankle-rocks'))
    expect(on.session.runtime?.warmup.getReady).toMatchObject({ running: true, endsAt: T0 + 3000 })
    expect(on.events).toEqual([{ type: 'tick', secondsLeft: 3 }])

    const off = completeRepStep(lower('slow-squats'), { now: T0, getReadyCountdown: false })
    expect(off.session.runtime?.warmup).toMatchObject({ index: indexOf(off.session, 'ankle-rocks'), getReady: null })
  })

  it('records a per-side rep step at its whole-step estimate, not twice it', () => {
    const s = completeRepStep(lower('bw-split-squats'), ctx(T0)).session
    expect(s.warmup[indexOf(s, 'bw-split-squats')].elapsedMs).toBe(60_000)
  })

  it('finishes the warm-up when Done is tapped on the last step', () => {
    expect(completeRepStep(lower('glute-bridges'), ctx(T0)).session.runtime?.phase).toBe('warmup-complete')
  })

  it('ignores START on a rep step and Done on a timed step', () => {
    const rep = lower('hip-hinges')
    expect(startWarmupStep(rep, ctx(T0)).session).toBe(rep)
    const timed = lower('ankle-rocks')
    expect(completeRepStep(timed, ctx(T0)).session).toBe(timed)
  })

  it('runs both sides of a per-side step on one timer and keeps the side through pause and resume', () => {
    let s = lower('worlds-greatest-stretch')
    const step = s.warmup[indexOf(s, 'worlds-greatest-stretch')]
    expect(stepWorkMs(step)).toBe(60_000)
    s = startWarmupStep(s, { now: T0, getReadyCountdown: false }).session
    expect(s.runtime?.warmup.timer).toMatchObject({ durationMs: 60_000, endsAt: T0 + 60_000 })
    expect(sideAt(step, 50_000)).toBe('L')
    expect(sideAt(step, 20_000)).toBe('R')

    s = pauseWarmup(s, ctx(T0 + 40_000)).session
    expect(s.warmup[indexOf(s, 'worlds-greatest-stretch')].elapsedMs).toBe(40_000)
    s = resumeWarmup(s, ctx(T0 + 90_000)).session
    const timer = s.runtime!.warmup.timer!
    expect(remainingMs(timer, T0 + 90_000)).toBe(20_000)
    expect(sideAt(step, remainingMs(timer, T0 + 90_000))).toBe('R')
  })
})
