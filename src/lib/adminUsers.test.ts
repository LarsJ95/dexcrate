import { FunctionsHttpError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } } }))
const { ADMIN_USERS_MISSING, adminUsersHealth, deleteUser, setBlocked } = await import('./adminUsers')

const httpError = (status: number, body: unknown): FunctionsHttpError => new FunctionsHttpError(new Response(JSON.stringify(body), { status }))

beforeEach(() => invoke.mockReset())

describe('admin-users', () => {
  it('functie niet gedeployd (404): zeg dat', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: httpError(404, {}) })
    await expect(setBlocked('u1', true, 'spam')).rejects.toThrow(ADMIN_USERS_MISSING)
  })
  it('fout van de functie zelf tonen', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: httpError(400, { error: 'Type the e-mail address of the account to confirm.' }) })
    await expect(deleteUser('u1', 'x@y.nl', 'reden')).rejects.toThrow(/Type the e-mail/)
  })
  it('juiste actie en waarden, zonder spaties eromheen', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true, filesRemoved: 3 }, error: null })
    expect(await deleteUser('u1', ' b@x.nl ', ' op verzoek ')).toBe(3)
    expect(invoke).toHaveBeenCalledWith('admin-users', { body: { action: 'delete', userId: 'u1', confirmEmail: 'b@x.nl', reason: 'op verzoek' } })
    invoke.mockResolvedValueOnce({ data: { ok: true }, error: null })
    await setBlocked('u1', false, 'sorry')
    expect(invoke).toHaveBeenLastCalledWith('admin-users', { body: { action: 'unban', userId: 'u1', reason: 'sorry' } })
  })
  it('health: onbekende waarde = missing', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true, serverKey: 'legacy' }, error: null })
    expect(await adminUsersHealth()).toBe('legacy')
    invoke.mockResolvedValueOnce({ data: { ok: true, serverKey: 'iets' }, error: null })
    expect(await adminUsersHealth()).toBe('missing')
  })
})
