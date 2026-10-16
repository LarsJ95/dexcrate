import { describe, expect, it } from 'vitest'
import { parseCardGame, stageLabel } from './cardGame'

describe('spelgegevens van een kaart', () => {
  it('Pokémon: HP, stadium, aanvallen, zwakte, terugtrekken', () => {
    const g = parseCardGame({
      category: 'Pokemon',
      hp: 330,
      stage: 'Stage2',
      evolveFrom: 'Charmeleon',
      attacks: [
        { cost: ['Fire'], name: 'Brave Wing', effect: 'More damage.', damage: '60+' },
        { cost: ['Fire', 'Lava'], name: 'Explosive Vortex', damage: 330 },
        { name: '' },
      ],
      weaknesses: [{ type: 'Water', value: '×2' }, { type: 'Lava', value: '×2' }],
      retreat: 2,
    })
    expect(g.hp).toBe(330)
    expect(stageLabel(g.stage ?? '')).toBe('Stage 2')
    expect(g.attacks).toEqual([
      { name: 'Brave Wing', cost: ['Fire'], damage: '60+', effect: 'More damage.' },
      { name: 'Explosive Vortex', cost: ['Fire'], damage: '330', effect: null },
    ])
    expect(g.weaknesses).toEqual([{ type: 'Water', value: '×2' }])
    expect(g.retreat).toBe(2)
  })

  it('trainer: tekst en soort; rommel valt weg', () => {
    const g = parseCardGame({ category: 'Trainer', trainerType: 'Item', effect: 'Burned and Confused.', hp: -5, retreat: 'x' })
    expect(g).toMatchObject({ category: 'Trainer', trainerType: 'Item', effect: 'Burned and Confused.', hp: null, retreat: null, attacks: [] })
  })
})
