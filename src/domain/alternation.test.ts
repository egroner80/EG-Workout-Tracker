import { describe, expect, it } from 'vitest'
import { createTemplate } from '../data/seed/defaultTemplate'
import { nextTemplateId } from './alternation'
import { buildSession, finishSession, reopenSession } from './session'
import type { TemplateId, WorkoutSession } from './types'

const NOW = Date.UTC(2026, 8, 28, 7, 0)
const HOUR = 3600_000

function inProgress(templateId: TemplateId): WorkoutSession {
  return buildSession({ id: `s-${templateId}`, now: NOW, template: createTemplate(templateId), prescriptions: new Map() })
}

describe('next workout type', () => {
  it('suggests upper body before any workout', () => {
    expect(nextTemplateId(null, [])).toBe('upper')
  })

  it('suggests lower body after an upper-body workout', () => {
    expect(nextTemplateId(null, [{ templateId: 'upper' }])).toBe('lower')
  })

  it('suggests upper body after a lower-body workout, going by the newest one only', () => {
    expect(nextTemplateId(null, [{ templateId: 'lower' }])).toBe('upper')
    expect(nextTemplateId(null, [{ templateId: 'lower' }, { templateId: 'lower' }, { templateId: 'upper' }])).toBe('upper')
  })

  it('suggests the other workout than the one in progress, whatever came before it', () => {
    expect(nextTemplateId(inProgress('lower'), [{ templateId: 'upper' }])).toBe('upper')
    expect(nextTemplateId(inProgress('upper'), [])).toBe('lower')
  })

  it('treats a finished workout reopened for edits as in progress', () => {
    const reopened = reopenSession(finishSession(inProgress('upper'), { now: NOW + HOUR }), NOW + 2 * HOUR)
    // While it is reopened, the newest finished workout is the one before it.
    expect(nextTemplateId(reopened, [{ templateId: 'lower' }])).toBe('lower')
  })

  it('reads a workout in progress from before the lower-body workout existed as upper body', () => {
    const { templateId: _untyped, ...legacy } = inProgress('upper')
    expect(nextTemplateId(legacy, [])).toBe('lower')
  })
})
