import { afterEach, describe, expect, it } from 'vitest'
import { createTemplate } from '../data/seed/defaultTemplate'
import { buildSession } from '../domain/session'
import { clearMirror, readMirror } from './mirror'

const KEY = 'overload.active-workout'

afterEach(() => clearMirror())

describe('active-workout mirror', () => {
  it('reads a workout mirrored by the first version as upper body', () => {
    const { templateId: _type, ...v1 } = buildSession({
      id: 'm1',
      now: Date.now(),
      template: createTemplate('upper'),
      prescriptions: new Map(),
    })
    localStorage.setItem(KEY, JSON.stringify({ schemaVersion: 1, session: v1 }))
    expect(readMirror()).toMatchObject({ id: 'm1', templateId: 'upper', status: 'active' })
  })

  it('ignores a copy written by a newer version', () => {
    const session = buildSession({ id: 'm2', now: Date.now(), template: createTemplate('lower'), prescriptions: new Map() })
    localStorage.setItem(KEY, JSON.stringify({ schemaVersion: 99, session }))
    expect(readMirror()).toBeNull()
  })
})
