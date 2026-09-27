import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '../data/db'
import { insertActiveSession } from '../data/repositories/sessions'
import { getMeta, updateMeta } from '../data/repositories/settingsRepo'
import { bootstrap } from '../data/seed/bootstrap'
import { createDefaultTemplate } from '../data/seed/defaultTemplate'
import { buildSession, finishSession, resolvePending } from '../domain/session'
import type { WorkoutSession } from '../domain/types'
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
  const session = buildSession({ id, now: startedAt, template: createDefaultTemplate(), prescriptions: new Map() })
  const all = Object.fromEntries(session.exercises.map((e) => [e.exerciseId, 'done' as const]))
  return finishSession(resolvePending(session, all), { now: startedAt + HOUR })
}

beforeEach(async () => {
  await resetDatabase()
  await bootstrap(NOW - 10 * HOUR)
})

describe('derived targets with demo data present', () => {
  it('ignores demo history for targets and LAST TIME', async () => {
    const targets = await getCurrentPrescriptions()
    expect(targets.get('db-row')).toMatchObject({ source: 'baseline', prescription: { loadKg: 18, reps: [5, 5, 5] } })
    expect((await loadLastTimes(['db-row'])).size).toBe(0)
  })

  it('applies an edit made on a fresh install to the next workout', async () => {
    await createOverride('db-bench', { kind: 'reps', loadKg: 14, reps: [5, 5, 5] }, NOW)
    expect((await getCurrentPrescriptions()).get('db-bench')).toMatchObject({
      source: 'override',
      prescription: { loadKg: 14 },
    })
  })

  it('clears demo workouts without touching real ones', async () => {
    await db.sessions.add(finishedWorkout('real-1', NOW - 5 * HOUR))
    const removed = await clearDemoData()
    expect(removed).toBeGreaterThan(0)
    expect((await db.sessions.toArray()).map((s) => s.id)).toEqual(['real-1'])
    expect((await getCurrentPrescriptions()).get('db-row')).toMatchObject({ sessionId: 'real-1' })
  })
})

describe('overrides and workouts', () => {
  it('refuses target edits while a workout is active', async () => {
    await insertActiveSession(buildSession({ id: 'live', now: NOW, template: createDefaultTemplate(), prescriptions: new Map() }))
    await expect(createOverride('db-row', { kind: 'reps', loadKg: 20, reps: [5, 5, 5] }, NOW)).rejects.toBeInstanceOf(
      WorkoutActiveError,
    )
  })

  it('records the replaced recommendation and "Use suggestion" restores it', async () => {
    await db.sessions.add(finishedWorkout('real-1', NOW - 5 * HOUR))
    const override = await createOverride('db-row', { kind: 'reps', loadKg: 20, reps: [5, 5, 5] }, NOW)
    expect(override.replacedRecommendation).toEqual({ kind: 'reps', loadKg: 18, reps: [5, 5, 6] })
    expect((await getCurrentPrescriptions()).get('db-row')?.source).toBe('override')

    await applySuggestion('db-row')
    expect((await getCurrentPrescriptions()).get('db-row')).toMatchObject({
      source: 'recommendation',
      prescription: { loadKg: 18, reps: [5, 5, 6] },
    })
  })

  it('deleting the newest workout falls back to the previous one and keeps later manual targets', async () => {
    await db.sessions.add(finishedWorkout('real-1', NOW - 50 * HOUR))
    await db.sessions.add(finishedWorkout('real-2', NOW - 5 * HOUR))
    await createOverride('dips', { kind: 'reps', loadKg: 5, reps: [5, 5, 5] }, NOW)

    await deleteWorkout('real-2', NOW + HOUR)
    const targets = await getCurrentPrescriptions()
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
    const plan = await previewImport(text)
    expect(plan.preview).toMatchObject({ newWorkouts: 1, overrides: 1 })
    await applyImport(plan)

    expect((await db.sessions.toArray()).map((s) => s.id)).toEqual(['real-1'])
    expect(await db.overrides.count()).toBe(1)
    expect((await getCurrentPrescriptions()).get('db-row')).toMatchObject({ source: 'override', prescription: { loadKg: 20 } })

    const again = await previewImport(text)
    expect(again.sessionsToPut).toEqual([])
    expect(again.overridesToPut).toEqual([])
  })

  it('leaves the database unchanged when the file is invalid', async () => {
    const before = await db.sessions.count()
    await expect(previewImport('{"format":"overload-backup","schemaVersion":99}')).rejects.toThrow(/newer version/)
    expect(await db.sessions.count()).toBe(before)
  })

  it('records the backup date', async () => {
    await updateMeta({ workoutsSinceBackup: 6 })
    await recordBackup(NOW)
    expect(await getMeta()).toMatchObject({ lastBackupAt: NOW, workoutsSinceBackup: 0 })
  })
})
