import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('./supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }))
const { MissingStepError, getCrateAudit, getScanStats, grantCratePoints, grantInputError, isAdmin, isBanned, listAdminUsers, toAdminAction, toAdminRules, toAdminUser } = await import('./admin')
const { actionText } = await import('./adminText')

beforeEach(() => rpc.mockReset())

/**
 * Nagebootste lijst-rpc (order + range): hoogstens 1000 rijen per verzoek, zoals de echte API. Gelijke waarden komen
 * per verzoek in een andere volgorde terug, zoals in Postgres: zonder unieke sortering raken de pagina's in de war.
 */
function listQuery(result: { rows: Record<string, unknown>[] } | { error: { code: string; message: string } }) {
  const calls = rpc.mock.calls.length
  const q = {
    orders: [] as string[],
    order: (col: string, opts: { ascending: boolean }) => {
      q.orders.push(`${col}.${opts.ascending ? 'asc' : 'desc'}`)
      return q
    },
    range: (from: number, to: number) => {
      if ('error' in result) return Promise.resolve({ data: null, error: result.error })
      const cols = q.orders.map((o) => o.split('.')[0])
      const rows = (calls % 2 ? [...result.rows].reverse() : [...result.rows]).sort((a, b) => {
        for (const c of cols) if (String(a[c]) !== String(b[c])) return String(a[c]) < String(b[c]) ? -1 : 1
        return 0
      })
      return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null })
    },
  }
  return q
}

describe('grantInputError', () => {
  it('geheel getal, niet 0, binnen de grens', () => {
    expect(grantInputError(0, 'reden')).not.toBeNull()
    expect(grantInputError(1.5, 'reden')).not.toBeNull()
    expect(grantInputError(Number.NaN, 'reden')).not.toBeNull()
    expect(grantInputError(100001, 'reden')).not.toBeNull()
    expect(grantInputError(-100000, 'reden')).toBeNull()
    expect(grantInputError(500, 'reden')).toBeNull()
  })
  it('reden 3 tot 200 tekens (zonder spaties eromheen)', () => {
    expect(grantInputError(5, '  ab ')).not.toBeNull()
    expect(grantInputError(5, 'x'.repeat(201))).not.toBeNull()
    expect(grantInputError(5, ' abc ')).toBeNull()
  })
})

describe('omzetten', () => {
  it('gebruiker: getallen ook als tekst (bigint), ontbrekende velden veilig', () => {
    expect(toAdminUser({ user_id: 'u1', email: 'a@b.nl', created_at: '2026-10-21T10:00:00Z', last_sign_in_at: null, is_admin: true, cards: '12', crate_points: 640, scans_24h: 3, errors_7d: null })).toEqual({
      id: 'u1',
      email: 'a@b.nl',
      createdAt: '2026-10-21T10:00:00Z',
      lastSignInAt: null,
      isAdmin: true,
      cards: 12,
      cratePoints: 640,
      scans24h: 3,
      scans30d: 0,
      errors7d: 0,
      scanPerMinute: null,
      scanPerDay: null,
      bannedUntil: null,
    })
    expect(toAdminUser({ email: 'zonder id' })).toBeNull()
    expect(toAdminUser(null)).toBeNull()
  })
  it('logregel', () => {
    expect(toAdminAction({ id: 'x', created_at: 't', admin_email: null, target_email: 'b@b.nl', points: -200, reason: 'correctie' })).toEqual({
      id: 'x',
      createdAt: 't',
      adminEmail: null,
      targetEmail: 'b@b.nl',
      action: 'grant_points',
      points: -200,
      reason: 'correctie',
      details: null,
    })
  })
  it('regels: ontbrekend of kapot = startwaarden van STAP22 (Great 200)', () => {
    const r = toAdminRules({ daily: 300, packs: { great: 'x', master: 900 }, craft: null })
    expect(r.daily).toBe(300)
    expect(r.packs.great).toBe(200)
    expect(r.packs.master).toBe(900)
    // STAP26-pakjes: startwaarden als ze ontbreken.
    expect([r.packs.lucky, r.packs.daily]).toEqual([150, 200])
    expect(r.craft.special).toBe(1800)
    expect(toAdminRules(null).trade_factor).toBe(2)
    // STAP27: dagplafond, standaard 1000.
    expect(toAdminRules(null).earn_cap).toBe(1000)
    expect(toAdminRules({ earn_cap: 2500 }).earn_cap).toBe(2500)
  })
  it('geblokkeerd alleen als de datum in de toekomst ligt', () => {
    const now = Date.parse('2026-10-21T12:00:00Z')
    expect(isBanned({ bannedUntil: '2126-01-01T00:00:00Z' }, now)).toBe(true)
    expect(isBanned({ bannedUntil: '2026-10-20T00:00:00Z' }, now)).toBe(false)
    expect(isBanned({ bannedUntil: null }, now)).toBe(false)
  })
  it('logregels als tekst', () => {
    const base = { id: 'x', createdAt: 't', adminEmail: 'a', targetEmail: 'b@b.nl', points: null, reason: 'r', details: null }
    expect(actionText({ ...base, action: 'grant_points', points: 50 })).toBe('+50 pts · b@b.nl')
    expect(actionText({ ...base, action: 'set_scan_limit', details: { per_minute: null, per_day: 2 } })).toBe('Scan limit 40/min, 2/day · b@b.nl')
    expect(actionText({ ...base, action: 'set_scan_limit', details: { per_minute: null, per_day: null } })).toBe('Scan limit default · b@b.nl')
    expect(actionText({ ...base, action: 'invite', targetEmail: null, details: { email: 'new@x.nl' } })).toBe('Invited new@x.nl')
  })
})

describe('database', () => {
  it('zonder STAP21 (functie ontbreekt) of bij een fout: geen beheerder', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    expect(await isAdmin()).toBe(false)
    rpc.mockResolvedValueOnce({ data: true, error: null })
    expect(await isAdmin()).toBe(true)
  })
  it('functie van STAP22 ontbreekt: zeg welke STAP', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    const err = await getScanStats().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(MissingStepError)
    expect((err as Error).message).toMatch(/STAP22/)
  })
  it('controleoverzicht (STAP27): rijen omgezet; zonder STAP27 zeg welke STAP', async () => {
    rpc.mockResolvedValueOnce({ data: [{ user_id: 'u1', email: 'a@b.nl', earned: '1000', best_day: 1000, cards_added: 120, cards_now: 300, points: 2400 }, { bogus: true }], error: null })
    expect(await getCrateAudit(7)).toEqual([{ userId: 'u1', email: 'a@b.nl', earned: 1000, bestDay: 1000, cardsAdded: 120, cardsNow: 300, points: 2400 }])
    expect(rpc).toHaveBeenLastCalledWith('admin_crate_audit', { p_days: 7 })
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    expect(((await getCrateAudit().catch((e: unknown) => e)) as Error).message).toMatch(/STAP27/)
  })
  it('geweigerd door de database: duidelijke fout', async () => {
    rpc.mockImplementation(() => listQuery({ error: { code: '42501', message: 'Not allowed' } }))
    await expect(listAdminUsers()).rejects.toThrow(/Not allowed/)
  })
  it('meer dan 1000 gebruikers: allemaal, oudste account eerst, in pagina’s', async () => {
    // 400 met dezelfde aanmaaktijd (bv. tegelijk uitgenodigd), over de grens van 1000 heen: dan beslist user_id.
    const users = Array.from({ length: 1500 }, (_, i) => ({
      user_id: `u-${String(i).padStart(4, '0')}`,
      email: `u${i}@example.com`,
      created_at: i >= 800 && i < 1200 ? '2026-10-05T00:00:00.000Z' : new Date(Date.UTC(2026, 9, i < 800 ? 1 : 6, 0, 0, i)).toISOString(),
    }))
    rpc.mockImplementation(() => listQuery({ rows: users }))
    const list = await listAdminUsers()
    expect(list.map((u) => u.id)).toEqual(users.map((u) => u.user_id))
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenNthCalledWith(1, 'admin_list_users')
    expect(rpc.mock.results.map((r) => (r.value as ReturnType<typeof listQuery>).orders)).toEqual([
      ['created_at.asc', 'user_id.asc'],
      ['created_at.asc', 'user_id.asc'],
    ])
  })
  it('punten: eerst zelf controleren, reden zonder spaties eromheen', async () => {
    await expect(grantCratePoints('u1', 0, 'reden')).rejects.toThrow()
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValueOnce({ data: 640, error: null })
    expect(await grantCratePoints('u1', 500, '  bedankt ')).toBe(640)
    expect(rpc).toHaveBeenCalledWith('admin_grant_points', { p_user: 'u1', p_points: 500, p_reason: 'bedankt' })
  })
})
