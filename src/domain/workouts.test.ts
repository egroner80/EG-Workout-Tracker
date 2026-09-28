import { describe, expect, it } from 'vitest'
import { isTemplateId, otherTemplate, templateLabel, workoutTypeOf } from './workouts'

describe('workout types', () => {
  it('reads a workout saved before the lower-body workout existed as upper body', () => {
    expect(workoutTypeOf({})).toBe('upper')
    expect(workoutTypeOf({ templateId: 'lower' })).toBe('lower')
  })

  it('pairs each workout with the other one and names it', () => {
    expect(otherTemplate('upper')).toBe('lower')
    expect(otherTemplate('lower')).toBe('upper')
    expect(templateLabel('lower')).toBe('Lower body')
  })

  it('recognises only the two workout ids', () => {
    expect(isTemplateId('upper')).toBe(true)
    expect(isTemplateId('default')).toBe(false)
    expect(isTemplateId(undefined)).toBe(false)
  })
})
