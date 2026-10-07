import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '../data/db'
import { insertActiveSession } from '../data/repositories/sessions'
import { getMeta, updateMeta } from '../data/repositories/settingsRepo'
import { getTemplate } from '../data/repositories/templateRepo'
import { bootstrap } from '../data/seed/bootstrap'
import { createTemplate } from '../data/seed/defaultTemplate'
import { buildSession, finishSession, resolvePending } from '../domain/session'
import { SQUAT_ROUTINE } from '../domain/sharedWarmup'
import { DEFAULT_SETTINGS, type WorkoutSession } from '../domain/types'
import {
  WorkoutActiveError,
  applyImport,
  clearDemoData,
  createBackup,
  createOverride,
  deleteWorkout,
  previewImport,
  recordBackup,
  applySuggestion,
} from './dataCommands'
import { getCurrentPrescriptions, loadLastTimes } from './queries'

const NOW = Date.UTC(2026, 8, 27, 17, 0)
const HOUR = 3600_000

function finishedWorkout(id: string, startedAt: number): WorkoutSession {
  const session = buildSession({ id, now: startedAt, template: createTemplate('upper'), prescriptions: new Map() })
  const all = Object.fromEntries(session.exercises.map((e) => [e.exerciseId, 'done' as const]))
  return finishSession(resolvePending(session, all), { now: startedAt + HOUR })
}

beforeEach(async () => {
  await resetDatabase()
  await bootstrap(NOW - 10 * HOUR)
})

describe('derived targets with demo data present', () => {
  it('ignores demo history for targets and LAST TIME', async () => {
    const targets = await getCurrentPrescriptions('upper')
    expect(targets.get('db-row')).toMatchObject({ source: 'baseline', prescription: { loadKg: 18, reps: [4, 4, 4] } })
    expect((await loadLastTimes(['db-row'])).size).toBe(0)
  })

  it('applies an edit made on a fresh install to the next workout', async () => {
    await createOverride('db-bench', { kind: 'reps', loadKg: 14, reps: [5, 5, 5] }, NOW)
    expect((await getCurrentPrescriptions('upper')).get('db-bench')).toMatchObject({
      source: 'override',
      prescription: { loadKg: 14 },
    })
  })

  it('clears demo workouts without touching real ones', async () => {
    await db.sessions.add(finishedWorkout('real-1', NOW - 5 * HOUR))
    const removed = await clearDemoData()
    expect(removed).toBeGreaterThan(0)
    expect((await db.sessions.toArray()).map((s) => s.id)).toEqual(['real-1'])
    expect((await getCurrentPrescriptions('upper')).get('db-row')).toMatchObject({ sessionId: 'real-1' })
  })
})

describe('overrides and workouts', () => {
  it('refuses target edits while a workout is active', async () => {
    await insertActiveSession(buildSession({ id: 'live', now: NOW, template: createTemplate('upper'), prescriptions: new Map() }))
    await expect(createOverride('db-row', { kind: 'reps', loadKg: 20, reps: [5, 5, 5] }, NOW)).rejects.toBeInstanceOf(
      WorkoutActiveError,
    )
  })

  it('records the replaced recommendation and "Use suggestion" restores it', async () => {
    await db.sessions.add(finishedWorkout('real-1', NOW - 5 * HOUR))
    const override = await createOverride('db-row', { kind: 'reps', loadKg: 20, reps: [5, 5, 5] }, NOW)
    expect(override.replacedRecommendation).toEqual({ kind: 'reps', loadKg: 18, reps: [5, 4, 4] })
    expect((await getCurrentPrescriptions('upper')).get('db-row')?.source).toBe('override')

    await applySuggestion('db-row')
    expect((await getCurrentPrescriptions('upper')).get('db-row')).toMatchObject({
      source: 'recommendation',
      prescription: { loadKg: 18, reps: [5, 4, 4] },
    })
  })

  it('deleting the newest workout falls back to the previous one and keeps later manual targets', async () => {
    await db.sessions.add(finishedWorkout('real-1', NOW - 50 * HOUR))
    await db.sessions.add(finishedWorkout('real-2', NOW - 5 * HOUR))
    await createOverride('dips', { kind: 'reps', loadKg: 5, reps: [5, 5, 5] }, NOW)

    await deleteWorkout('real-2', NOW + HOUR)
    const targets = await getCurrentPrescriptions('upper')
    expect(targets.get('db-row')).toMatchObject({ sessionId: 'real-1' })
    expect(targets.get('dips')).toMatchObject({ source: 'override', prescription: { loadKg: 5 } })
  })
})

describe('backup round trip through the database', () => {
  it('exports, wipes, and imports every record kind; importing twice changes nothing', async () => {
    await db.sessions.add(finishedWorkout('real-1', NOW - 5 * HOUR))
    await createOverride('db-row', { kind: 'reps', loadKg: 20, reps: [5, 5, 5] }, NOW)
    const backup = await createBackup(NOW)
    const text = JSON.stringify(backup)

    await resetDatabase()
    await bootstrap(NOW, { demo: false })
    const plan = await previewImport(text, NOW)
    expect(plan.preview).toMatchObject({ newWorkouts: 1, overrides: 1 })
    await applyImport(plan, NOW)

    expect((await db.sessions.toArray()).map((s) => s.id)).toEqual(['real-1'])
    expect(await db.overrides.count()).toBe(1)
    expect((await getCurrentPrescriptions('upper')).get('db-row')).toMatchObject({ source: 'override', prescription: { loadKg: 20 } })

    const again = await previewImport(text, NOW)
    expect(again.sessionsToPut).toEqual([])
    expect(again.overridesToPut).toEqual([])
  })

  it('restores a first-version backup as upper body and lines up the shared warm-up in lower', async () => {
    const upper = createTemplate('upper')
    const squatIds = new Set(SQUAT_ROUTINE.map((step) => step.id))
    const { templateId: _type, ...legacyWorkout } = finishedWorkout('old-1', NOW - 48 * HOUR)
    const v1 = {
      format: 'overload-backup',
      appVersion: '0.1.0',
      schemaVersion: 1,
      exportedAt: NOW - HOUR,
      counts: { sessions: 1, overrides: 0 },
      sessions: [legacyWorkout],
      overrides: [],
      template: {
        ...upper,
        id: 'default',
        warmup: upper.warmup
          .filter((step) => !squatIds.has(step.id))
          .map((step) => (step.id === 'jump-rope' ? { ...step, progression: { stepSec: 10, maxSec: 360 } } : step)),
        updatedAt: NOW - 2 * HOUR,
      },
      settings: { ...DEFAULT_SETTINGS },
    }
    const plan = await previewImport(JSON.stringify(v1), NOW)
    expect(plan.templates.map((t) => t.id)).toEqual(['upper'])
    await applyImport(plan, NOW)

    expect((await db.sessions.get('old-1'))?.templateId).toBe('upper')
    const restoredUpper = await getTemplate('upper')
    expect(restoredUpper.warmup.some((step) => step.id === 'deep-squat-hold')).toBe(true)
    const lower = await getTemplate('lower')
    expect(lower.warmup.find((step) => step.id === 'jump-rope')?.progression?.maxSec).toBe(360)
    expect(lower.exercises[0].id).toBe('bulgarian-split-squat')
  })

  it('leaves the database unchanged when the file is invalid', async () => {
    const before = await db.sessions.count()
    await expect(previewImport('{"format":"overload-backup","schemaVersion":99}', NOW)).rejects.toThrow(/newer version/)
    expect(await db.sessions.count()).toBe(before)
  })

  it('records the backup date', async () => {
    await updateMeta({ workoutsSinceBackup: 6 })
    await recordBackup(NOW)
    expect(await getMeta()).toMatchObject({ lastBackupAt: NOW, workoutsSinceBackup: 0 })
  })
})
