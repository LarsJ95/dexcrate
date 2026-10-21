import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('./supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }))
const { MissingStepError, getScanStats, grantCratePoints, grantInputError, isAdmin, isBanned, listAdminUsers, toAdminAction, toAdminRules, toAdminUser } = await import('./admin')
const { actionText } = await import('./adminText')

beforeEach(() => rpc.mockReset())

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
    expect(r.craft.special).toBe(600)
    expect(toAdminRules(null).trade_factor).toBe(2)
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
  it('geweigerd door de database: duidelijke fout', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Not allowed' } })
    await expect(listAdminUsers()).rejects.toThrow(/Not allowed/)
  })
  it('punten: eerst zelf controleren, reden zonder spaties eromheen', async () => {
    await expect(grantCratePoints('u1', 0, 'reden')).rejects.toThrow()
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValueOnce({ data: 640, error: null })
    expect(await grantCratePoints('u1', 500, '  bedankt ')).toBe(640)
    expect(rpc).toHaveBeenCalledWith('admin_grant_points', { p_user: 'u1', p_points: 500, p_reason: 'bedankt' })
  })
})
