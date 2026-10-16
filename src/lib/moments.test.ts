import { describe, expect, it } from 'vitest'
import { SET_MILESTONES, newMilestone } from './moments'

describe('mijlpalen', () => {
  it('hoogste nieuwe mijlpaal boven wat al gevierd is', () => {
    expect(newMilestone(9, 0, SET_MILESTONES)).toBeNull()
    expect(newMilestone(10, 0, SET_MILESTONES)).toBe(10)
    expect(newMilestone(30, 10, SET_MILESTONES)).toBe(25)
    expect(newMilestone(30, 25, SET_MILESTONES)).toBeNull()
    expect(newMilestone(120, 25, SET_MILESTONES)).toBe(100)
  })
})
