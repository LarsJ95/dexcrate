import { describe, expect, it } from 'vitest'
import { openingScope } from './setsScope'

describe('openingScope', () => {
  it('nog niets gekozen: Started vanaf 3 sets met kaarten, anders alles', () => {
    expect(openingScope('auto', 0)).toBe('all')
    expect(openingScope('auto', 2)).toBe('all')
    expect(openingScope('auto', 3)).toBe('owned')
  })

  it('eigen keuze gaat altijd voor', () => {
    expect(openingScope('all', 12)).toBe('all')
    expect(openingScope('complete', 0)).toBe('complete')
  })
})
