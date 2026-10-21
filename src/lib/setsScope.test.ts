import { describe, expect, it } from 'vitest'
import { openingScope } from './setsScope'

describe('openingScope', () => {
  it('nog niets gekozen: alle sets (op verzoek, 21-10-2026)', () => {
    expect(openingScope('auto')).toBe('all')
  })

  it('eigen keuze gaat altijd voor', () => {
    expect(openingScope('owned')).toBe('owned')
    expect(openingScope('complete')).toBe('complete')
  })
})
