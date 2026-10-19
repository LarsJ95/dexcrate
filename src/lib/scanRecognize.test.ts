import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('./supabase', () => ({ supabase: { functions: { invoke } } }))

const { LOOK_AGAIN_OUTDATED, recognizeCards } = await import('./scan')

const img = { blob: new Blob(), data: 'AAAA', mediaType: 'image/jpeg' as const, previewUrl: 'blob:x' }
const card = { position: 1, name_english: 'Mew ex', language: 'en', set_code: 'MEW', card_number: '151', set_total: '165', confidence: 'high', variant: 'holo' }

beforeEach(() => invoke.mockReset())

describe('recognizeCards', () => {
  it('gewone scan: geen strong in het verzoek', async () => {
    invoke.mockResolvedValueOnce({ data: { cards: [card], model: 'claude-haiku-5-5' }, error: null })
    const r = await recognizeCards(img, 'single')
    expect(invoke).toHaveBeenCalledWith('recognize-card', { body: { data: 'AAAA', media_type: 'image/jpeg', mode: 'single' } })
    expect(r.cards[0].nameEnglish).toBe('Mew ex')
  })

  it('Look again: strong in het verzoek; functie bevestigt → resultaat', async () => {
    invoke.mockResolvedValueOnce({ data: { cards: [card], model: 'claude-sonnet-5-5', strong: true }, error: null })
    const r = await recognizeCards(img, 'single', { strong: true })
    expect(invoke).toHaveBeenCalledWith('recognize-card', { body: { data: 'AAAA', media_type: 'image/jpeg', mode: 'single', strong: true } })
    expect(r.model).toBe('claude-sonnet-5-5')
  })

  it('Look again bij een oude functie (bevestigt niet): duidelijke fout i.p.v. het goedkope resultaat', async () => {
    invoke.mockResolvedValueOnce({ data: { cards: [card], model: 'claude-haiku-5-5' }, error: null })
    await expect(recognizeCards(img, 'single', { strong: true })).rejects.toThrow(LOOK_AGAIN_OUTDATED)
  })
})
