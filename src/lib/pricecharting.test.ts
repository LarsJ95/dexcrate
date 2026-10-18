import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
const { pcImageUrl, pcQuery, pickRow } = await import('./pricecharting')

const row = (title: string, consoleName: string, hash = 'abc123def') => ({ title, console: consoleName, hash })

describe('PriceCharting: juiste regel kiezen', () => {
  it('naam, nummer en set moeten kloppen', () => {
    const rows = [row('Charizard #1', 'Pokemon McDonalds 2024', 'goodhash1'), row('Dark Charizard #1', 'Pokemon McDonalds 2024'), row('Charizard #2', 'Pokemon McDonalds 2024')]
    expect(pickRow(rows, 'Charizard', '1', "McDonald's Collection 2024")?.hash).toBe('goodhash1')
  })

  it('eigen catalogus: Pokémon TCG Classic (antwoord van PriceCharting, 18-10-2026)', () => {
    const rows = [row('Voltorb #10', 'Pokemon TCG Classic: Charizard Deck', 'ypd5tlv52rkkkn72')]
    expect(pickRow(rows, 'Voltorb', '010', 'Pokémon TCG Classic (Charizard)')?.hash).toBe('ypd5tlv52rkkkn72')
    expect(pickRow(rows, 'Voltorb', '011', 'Pokémon TCG Classic (Charizard)')).toBeNull()
  })

  it('jaartal moet kloppen: 2014 is niet 2024', () => {
    expect(pickRow([row('Charizard #1', 'Pokemon McDonalds 2024')], 'Charizard', '1', "McDonald's Collection 2014")).toBeNull()
  })

  it('voorloopnullen en promo-sets', () => {
    expect(pickRow([row('Mega Charizard X EX #23', 'Pokemon Promo', 'promohash')], 'Mega Charizard X ex', '023', 'MEP Black Star Promos')?.hash).toBe('promohash')
  })

  it('variant tussen haken als nummer (Unown [A])', () => {
    const rows = [row('Unown [I]', 'Pokemon Unseen Forces'), row('Unown [A]', 'Pokemon Unseen Forces', 'unownahash')]
    expect(pickRow(rows, 'Unown', 'A', 'Unseen Forces Unown Collection')?.hash).toBe('unownahash')
  })

  it('zonder nummer alleen bij een duidelijke set; liever zonder extra variant', () => {
    const rows = [row('Pikachu [Blue Border]', 'Pokemon My First Battle', 'blue'), row('Pikachu', 'Pokemon My First Battle', 'plain')]
    expect(pickRow(rows, 'Pikachu', '1', 'My First Battle')?.hash).toBe('plain')
    expect(pickRow([row('Pikachu', 'Pokemon Base Set')], 'Pikachu', '1', 'My First Battle')).toBeNull()
  })

  it('plaatjes-URL en zoekterm', () => {
    expect(pcImageUrl('wq5ljixfclgci3qw', 'low')).toBe('https://storage.googleapis.com/images.pricecharting.com/wq5ljixfclgci3qw/240.jpg')
    expect(pcImageUrl('../x', 'low')).toBeNull()
    expect(pcImageUrl('897556afa242320c23336ac08e811c7a563b80e9206867b1c1eeb7c61dd800f5', 'high')).toBe(
      'https://storage.googleapis.com/images.pricecharting.com/897556afa242320c23336ac08e811c7a563b80e9206867b1c1eeb7c61dd800f5/1600.jpg',
    )
    expect(pcQuery('Sylveon', 'XY trainer Kit (Sylveon)')).toBe('Sylveon XY trainer Kit Sylveon')
  })
})
