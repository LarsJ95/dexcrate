import { describe, expect, it, vi } from 'vitest'

// excel.ts → types.ts laden geen Supabase, maar voor de zekerheid (CI zonder sleutels):
vi.mock('./supabase', () => ({ supabase: {} }))

const { initialState, validate } = await import('./cardForm')

const empty = initialState(null, 'collection')

describe('initialState', () => {
  it('nieuwe kaart: Engels, 1 stuk, in bezit', () => {
    expect(empty.language).toBe('en')
    expect(empty.quantity).toBe('1')
    expect(empty.ownership).toBe('owned')
    expect(empty.availability).toBe('keep')
  })

  it('direct als verkocht: verkoopdatum van vandaag', () => {
    expect(initialState(null, 'sold').sale_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('validate', () => {
  it('naam verplicht', () => {
    expect(validate({ ...empty, name: '  ' })).toEqual({ error: 'Enter a name.' })
  })

  it('aantal geheel en binnen grenzen', () => {
    expect(validate({ ...empty, name: 'Pikachu', quantity: '0' })).toHaveProperty('error')
    expect(validate({ ...empty, name: 'Pikachu', quantity: '1.5' })).toHaveProperty('error')
    expect(validate({ ...empty, name: 'Pikachu', quantity: '10000' })).toHaveProperty('error')
  })

  it('grading: bedrijf en halve cijfers', () => {
    expect(validate({ ...empty, name: 'Pikachu', grade: '9' })).toEqual({ error: 'Choose the grading company.' })
    expect(validate({ ...empty, name: 'Pikachu', grading_company: 'PSA', grade: '9.3' })).toHaveProperty('error')
    const ok = validate({ ...empty, name: 'Pikachu', grading_company: 'PSA', grade: '9,5' })
    expect('value' in ok && ok.value.grade).toBe(9.5)
  })

  it('lege prijs blijft onbekend (null), niet 0', () => {
    const r = validate({ ...empty, name: 'Pikachu', purchase_price: '' })
    expect('value' in r && r.value.purchase_price).toBeNull()
  })

  it('verkoopgegevens alleen bij te koop of verkocht', () => {
    const keep = validate({ ...empty, name: 'Pikachu', sale_price: '5', sale_channel: 'Vinted' })
    expect('value' in keep && keep.value.sale_price).toBeNull()
    const forSale = validate({ ...empty, name: 'Pikachu', availability: 'for_sale', sale_price: '5,50' })
    expect('value' in forSale && forSale.value.sale_price).toBe(5.5)
    expect('value' in forSale && forSale.value.status).toBe('for_sale')
  })

  it('sealed: geen set, nummer, taal of uitvoering', () => {
    const r = validate({ ...empty, name: 'Booster box', kind: 'sealed', set_code: 'MEW', card_number: '1', variant: 'holo', tcgdex_id: 'en/sv03.5-1' })
    expect('value' in r && r.value).toMatchObject({ set_code: null, card_number: null, language: null, variant: null, tcgdex_id: null })
  })
})
