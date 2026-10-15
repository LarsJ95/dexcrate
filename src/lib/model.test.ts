import { describe, expect, it, vi } from 'vitest'

// db.ts maakt bij import een Supabase-client; die is hier niet nodig.
vi.mock('./supabase', () => ({ supabase: {} }))

const { toCard, toRow, V2_FIELDS } = await import('./db')
const { matchesSearch } = await import('./search')
const { EMPTY_CARD, deriveStatus, fromStatus, primaryPhoto, statusBadge, statusFields } = await import('./types')

describe('bezit, beschikbaarheid en status', () => {
  it('leidt de oude status af zoals de databasetrigger', () => {
    expect(deriveStatus('owned', 'keep')).toBe('collection')
    expect(deriveStatus('owned', 'for_sale')).toBe('for_sale')
    expect(deriveStatus('owned', 'reserved')).toBe('for_sale')
    expect(deriveStatus('incoming', 'keep')).toBe('collection')
    expect(deriveStatus('sold', 'keep')).toBe('sold')
    expect(deriveStatus('traded', 'keep')).toBe('sold')
    expect(deriveStatus('given_away', 'keep')).toBe('sold')
  })

  it('zet oude status om naar bezit + beschikbaarheid en terug', () => {
    for (const s of ['collection', 'for_sale', 'sold'] as const) {
      const f = fromStatus(s)
      expect(deriveStatus(f.ownership, f.availability)).toBe(s)
      expect(statusFields(s).status).toBe(s)
    }
  })

  it('badge alleen als er iets te melden is', () => {
    expect(statusBadge({ ownership: 'owned', availability: 'keep' })).toBeNull()
    expect(statusBadge({ ownership: 'owned', availability: 'reserved' })).toBe('Reserved')
    expect(statusBadge({ ownership: 'incoming', availability: 'for_sale' })).toBe('Incoming')
    expect(statusBadge({ ownership: 'traded', availability: 'keep' })).toBe('Traded')
  })
})

describe('toCard (database → app)', () => {
  it('rij van vóór STAP4 krijgt bezit en beschikbaarheid uit de status', () => {
    const c = toCard({ id: 'a', name: 'Pikachu', quantity: 3, status: 'for_sale' })
    expect(c?.ownership).toBe('owned')
    expect(c?.availability).toBe('for_sale')
    expect(c?.photos).toEqual([])
  })

  it("rij na STAP4: eigen velden en foto's, oudste foto eerst", () => {
    const c = toCard({
      id: 'b',
      name: 'Eevee',
      status: 'collection',
      ownership: 'incoming',
      availability: 'keep',
      link_status: 'manual',
      cardmarket_id: '851230',
      card_photos: [
        { id: 'p2', path: 'u/2.jpg', label: 'back', is_primary: false, created_at: '2026-10-02' },
        { id: 'p1', path: 'u/1.jpg', label: 'front', is_primary: false, created_at: '2026-10-01' },
        { id: 'x' }, // onvolledig: overslaan
      ],
    })
    expect(c?.ownership).toBe('incoming')
    expect(c?.link_status).toBe('manual')
    expect(c?.cardmarket_id).toBe(851230)
    expect(c?.photos.map((p) => p.id)).toEqual(['p1', 'p2'])
    // Geen gemarkeerde hoofdfoto: de oudste.
    expect(c && primaryPhoto(c)?.id).toBe('p1')
  })

  it('onbekende waarden worden niet overgenomen', () => {
    const c = toCard({ id: 'c', name: 'X', ownership: 'stolen', availability: 'maybe', status: 'sold' })
    expect(c?.ownership).toBe('sold')
    expect(c?.availability).toBe('keep')
  })
})

describe('toRow (app → database)', () => {
  const input = { ...EMPTY_CARD, name: 'Mew', ...statusFields('collection') }

  it('status volgt altijd bezit + beschikbaarheid', () => {
    const row = toRow({ ...input, ownership: 'sold', availability: 'keep', status: 'collection' }, true)
    expect(row.status).toBe('sold')
  })

  it('zonder STAP4 gaan de nieuwe velden niet mee (opslaan blijft werken)', () => {
    const row = toRow({ ...input, notes: 'x', ownership: 'owned', availability: 'for_sale' }, false)
    for (const f of V2_FIELDS) expect(f in row).toBe(false)
    expect(row.status).toBe('for_sale')
    // Lege oude fotokolom niet meesturen: die bestaat pas na STAP3.
    expect('image_path' in row).toBe(false)
  })

  it('zonder STAP4 mag een foto wel bewust gewist worden', () => {
    expect(toRow({ image_path: null }, false)).toEqual({ image_path: null })
  })

  it('met STAP4 nooit de oude fotokolom', () => {
    const row = toRow({ ...input, image_path: 'u/oud.jpg' }, true)
    expect('image_path' in row).toBe(false)
    expect(row.ownership).toBe('owned')
  })
})

describe('matchesSearch', () => {
  const mew = { ...EMPTY_CARD, name: 'Mew ex', set_code: 'MEW', card_number: '151', notes: 'Utrecht fair' }

  it('elk woord moet ergens voorkomen', () => {
    expect(matchesSearch(mew, 'mew 151')).toBe(true)
    expect(matchesSearch(mew, '#151')).toBe(true)
    expect(matchesSearch(mew, 'utrecht')).toBe(true)
    expect(matchesSearch(mew, 'mew 152')).toBe(false)
    expect(matchesSearch(mew, '   ')).toBe(true)
  })
})
