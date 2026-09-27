import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../db'
import { addOverride, deleteOverridesForTarget, listOverrides } from './overrides'

beforeEach(async () => {
  await resetDatabase()
})

describe('override repository', () => {
  it('stores and deletes overrides by target', async () => {
    const base = { prescription: { kind: 'reps' as const, loadKg: 20, reps: [5, 5, 5] }, createdAt: 1, updatedAt: 1 }
    await addOverride({ id: 'a', targetId: 'db-row', ...base })
    await addOverride({ id: 'b', targetId: 'dips', ...base })
    expect(await listOverrides()).toHaveLength(2)
    expect(await deleteOverridesForTarget('db-row')).toBe(1)
    expect((await listOverrides()).map((o) => o.id)).toEqual(['b'])
  })
})
