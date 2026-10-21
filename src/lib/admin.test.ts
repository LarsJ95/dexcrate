import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('./supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }))
const { grantCratePoints, grantInputError, isAdmin, listAdminUsers, toAdminAction, toAdminUser } = await import('./admin')

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
      errors7d: 0,
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
      points: -200,
      reason: 'correctie',
    })
  })
})

describe('database', () => {
  it('zonder STAP21 (functie ontbreekt) of bij een fout: geen beheerder', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    expect(await isAdmin()).toBe(false)
    rpc.mockResolvedValueOnce({ data: true, error: null })
    expect(await isAdmin()).toBe(true)
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
