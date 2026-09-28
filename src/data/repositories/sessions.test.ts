import { beforeEach, describe, expect, it } from 'vitest'
import { buildSession, finishSession, resolvePending } from '../../domain/session'
import type { WorkoutSession } from '../../domain/types'
import { db, resetDatabase } from '../db'
import { createTemplate } from '../seed/defaultTemplate'
import {
  ActiveSessionExistsError,
  GuardRejection,
  getActiveSession,
  getSession,
  insertActiveSession,
  listHistory,
  saveActiveSession,
  transitionSession,
} from './sessions'

const NOW = Date.UTC(2026, 8, 27, 17, 0)

function active(id = 's1'): WorkoutSession {
  return buildSession({ id, now: NOW, template: createTemplate('upper'), prescriptions: new Map() })
}

beforeEach(async () => {
  await resetDatabase()
})

describe('session repository', () => {
  it('round-trips an active session unchanged', async () => {
    const session = active()
    await insertActiveSession(session)
    expect(await getSession('s1')).toEqual(session)
    expect((await getActiveSession())?.id).toBe('s1')
  })

  it('refuses a second active session', async () => {
    await insertActiveSession(active('s1'))
    await expect(insertActiveSession(active('s2'))).rejects.toBeInstanceOf(ActiveSessionExistsError)
  })

  it('enforces one active session at the index level too', async () => {
    await db.sessions.add(active('s1'))
    await expect(db.sessions.add(active('s2'))).rejects.toThrow()
  })

  it('accepts newer revisions and rejects stale ones', async () => {
    const session = active()
    await insertActiveSession(session)
    const next = { ...session, rev: 2, lastInteractionAt: NOW + 1 }
    await saveActiveSession(next)
    await expect(saveActiveSession({ ...session, rev: 2 })).rejects.toMatchObject({ reason: 'stale' })
    expect((await getSession('s1'))?.lastInteractionAt).toBe(NOW + 1)
  })

  it('rejects a save that changes planned values', async () => {
    const session = active()
    await insertActiveSession(session)
    const tampered = structuredClone(session)
    tampered.rev = 2
    const row = tampered.exercises[2]
    if (row.kind === 'reps') row.planned.loadKg = 16
    await expect(saveActiveSession(tampered)).rejects.toMatchObject({ reason: 'planned-changed' })
  })

  it('rejects a late save to a finished workout', async () => {
    const session = active()
    await insertActiveSession(session)
    await transitionSession('s1', (current) => finishSession(current, { now: NOW + 3600_000 }))
    const late = { ...session, rev: 99 }
    const error = await saveActiveSession(late).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GuardRejection)
    expect((error as GuardRejection).reason).toBe('not-active')
    expect((await getSession('s1'))?.status).toBe('completed')
  })

  it('lists finished, non-deleted workouts newest first', async () => {
    const template = createTemplate('upper')
    const make = (id: string, start: number) =>
      finishSession(
        resolvePending(buildSession({ id, now: start, template, prescriptions: new Map() }), { dips: 'done' }),
        { now: start + 1000 },
      )
    await db.sessions.bulkAdd([make('a', NOW), make('b', NOW + 10_000), { ...make('c', NOW + 20_000), deletedAt: NOW + 30_000 }])
    expect((await listHistory()).map((s) => s.id)).toEqual(['b', 'a'])
  })
})
