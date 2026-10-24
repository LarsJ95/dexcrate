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
      if (body.action === 'sync') return { data: { points: 500, earned: 25, free_pack: true, waiting: 120, cap: 1000 }, error: null }
      if (body.action === 'open') return { data: { points: 300, cost: 200, free_pack: false, pulls: [{ tcgdex_id: 'en/s1-001', name: 'A', image: null, rarity: 'Common', set_name: 'S' }] }, error: null }
      return { data: null, error: new Error('?') }
    })
    const { openPack, syncCrate } = await import('./crate')
    // STAP27: punten boven het dagplafond wachten (waiting).
    expect(await syncCrate({ x: 20 }, [1, 2, 3])).toEqual({ points: 500, freePack: true, earned: 25, waiting: 120 })
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

describe('Pack of the day hoogstens 3 per dag (STAP28)', () => {
  it('aantal over vandaag; zonder STAP28 geen grens (null)', async () => {
    const { getDailyPacksLeft } = await import('./crate')
    rpc.mockResolvedValueOnce({ data: 2, error: null })
    expect(await getDailyPacksLeft()).toBe(2)
    expect(rpc).toHaveBeenLastCalledWith('crate_daily_left')
    rpc.mockResolvedValueOnce({ data: 9, error: null })
    expect(await getDailyPacksLeft()).toBe(3)
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    expect(await getDailyPacksLeft()).toBeNull()
    rpc.mockResolvedValueOnce({ data: null, error: { code: '500', message: 'kapot' } })
    await expect(getDailyPacksLeft()).rejects.toThrow(/kapot/)
  })

  it('na openen stuurt de server mee hoeveel er nog over zijn; de melding bij de 4e komt door', async () => {
    const pull = { tcgdex_id: 'en/s1-001', name: 'A', image: null, rarity: 'Common', set_name: 'S' }
    let left = 1
    invoke.mockImplementation(async (_fn: string, { body }: { body: { action: string } }) => {
      if (body.action === 'health') return { data: { ok: true, db: true }, error: null }
      if (left < 0) return { data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ error: 'Pack of the day: 3 a day. Come back tomorrow for a new set.' }), { status: 400 })) }
      return { data: { points: 100, cost: 200, free_pack: false, daily_left: left--, pulls: [pull] }, error: null }
    })
    const { openPack } = await import('./crate')
    expect((await openPack('daily')).dailyLeft).toBe(1)
    expect((await openPack('daily')).dailyLeft).toBe(0)
    await expect(openPack('daily')).rejects.toThrow('Pack of the day: 3 a day')
  })
})
