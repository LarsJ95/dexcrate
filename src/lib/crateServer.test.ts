import { FunctionsHttpError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Server (STAP23) of oude manier: elke test laadt crate.ts opnieuw (de servercontrole wordt per sessie onthouden).
const invoke = vi.fn()
const rpc = vi.fn()
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, rpc: (...a: unknown[]) => rpc(...a) } }))

const notFound = (): { data: null; error: FunctionsHttpError } => ({ data: null, error: new FunctionsHttpError(new Response('{}', { status: 404 })) })

beforeEach(() => {
  invoke.mockReset()
  rpc.mockReset()
  vi.resetModules()
})

describe('Crate via de server', () => {
  it('functie klaar: sync en pakje via de functie, de app stuurt geen bonus of Pokédex', async () => {
    invoke.mockImplementation(async (_fn: string, { body }: { body: { action: string } }) => {
      if (body.action === 'health') return { data: { ok: true, db: true }, error: null }
      if (body.action === 'sync') return { data: { points: 500, earned: 25, free_pack: true }, error: null }
      if (body.action === 'open') return { data: { points: 300, cost: 200, free_pack: false, pulls: [{ tcgdex_id: 'en/s1-001', name: 'A', image: null, rarity: 'Common', set_name: 'S' }] }, error: null }
      return { data: null, error: new Error('?') }
    })
    const { openPack, syncCrate } = await import('./crate')
    expect(await syncCrate({ x: 20 }, [1, 2, 3])).toEqual({ points: 500, freePack: true, earned: 25 })
    expect(invoke).toHaveBeenCalledWith('crate', { body: { action: 'sync' } })
    const r = await openPack('great', { setId: 'sv03.5' })
    expect(r.pulls).toHaveLength(1)
    expect(r.cost).toBe(200)
    expect(invoke).toHaveBeenLastCalledWith('crate', { body: { action: 'open', pack: 'great', setId: 'sv03.5' } })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('functie niet gedeployd (404): oude manier', async () => {
    invoke.mockResolvedValue(notFound())
    rpc.mockResolvedValue({ data: { points: 10, earned: 0, free_pack: false }, error: null })
    const { syncCrate, craftCard, CRATE_SERVER_MISSING } = await import('./crate')
    expect((await syncCrate({}, [25])).points).toBe(10)
    expect(rpc).toHaveBeenCalledWith('crate_sync', { p_bonus: {}, p_dex: [25] })
    await expect(craftCard('en/s1-001')).rejects.toThrow(CRATE_SERVER_MISSING)
  })
  it('foutmelding van de functie tonen (bv. te weinig punten), met de nieuwe naam Pack points', async () => {
    const reply = (error: string) =>
      invoke.mockImplementation(async (_fn: string, { body }: { body: { action: string } }) =>
        body.action === 'health' ? { data: { ok: true, db: true }, error: null } : { data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ error }), { status: 400 })) },
      )
    const { craftCard } = await import('./crate')
    reply('Not enough Crate points.')
    await expect(craftCard('en/s1-001')).rejects.toThrow('Not enough Pack points.')
    reply('Card not found.')
    await expect(craftCard('en/s1-001')).rejects.toThrow('Card not found.')
  })
  it('functie wel, STAP23 niet (db false): oude manier', async () => {
    invoke.mockResolvedValue({ data: { ok: true, db: false }, error: null })
    rpc.mockResolvedValue({ data: 250, error: null })
    const { crateSetComplete } = await import('./crate')
    expect(await crateSetComplete('en/sv03.5')).toBe(250)
    expect(rpc).toHaveBeenCalledWith('crate_set_complete', { p_set: 'en/sv03.5' })
  })
})
