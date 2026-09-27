import { describe, expect, it } from 'vitest'
import { createDefaultTemplate } from '../data/seed/defaultTemplate'
import { MigrationError, SCHEMA_VERSION, isValidSession, migrateSession } from './migrate'
import { buildSession } from './session'

const session = buildSession({ id: 's1', now: 1, template: createDefaultTemplate(), prescriptions: new Map() })

describe('migrateSession', () => {
  it('accepts a current-version session unchanged', () => {
    expect(migrateSession(structuredClone(session), SCHEMA_VERSION)).toEqual(session)
  })

  it('refuses data from a newer schema version', () => {
    expect(() => migrateSession(session, SCHEMA_VERSION + 1)).toThrow(MigrationError)
  })

  it('rejects malformed records', () => {
    expect(() => migrateSession({ id: 's1' }, SCHEMA_VERSION)).toThrow(MigrationError)
  })
})

describe('isValidSession', () => {
  it('requires runtime state on active sessions and recommendations on finished ones', () => {
    expect(isValidSession(session)).toBe(true)
    expect(isValidSession({ ...session, runtime: undefined })).toBe(false)
    expect(isValidSession({ ...session, status: 'completed' })).toBe(false)
  })
})
