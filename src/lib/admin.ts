import { supabase } from './supabase'

/**
 * Beheer (STAP21): gebruikers bekijken en Crate points toekennen of afhalen. Wie beheerder is bepaalt de database
 * (tabel admins); elke functie controleert dat zelf. De app gebruikt isAdmin() alleen om de pagina te tonen.
 */

export interface AdminUser {
  id: string
  email: string
  createdAt: string
  lastSignInAt: string | null
  isAdmin: boolean
  /** Kaarten in bezit (niet verkocht). */
  cards: number
  cratePoints: number
  scans24h: number
  errors7d: number
}

export interface AdminAction {
  id: string
  createdAt: string
  adminEmail: string | null
  targetEmail: string | null
  points: number | null
  reason: string
}

/** Grenzen zoals in admin_grant_points. */
export const MAX_GRANT = 100000
export const REASON_MIN = 3
export const REASON_MAX = 200

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : 0)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

export function toAdminUser(r: unknown): AdminUser | null {
  if (!isRecord(r) || typeof r.user_id !== 'string') return null
  return {
    id: r.user_id,
    email: str(r.email) ?? '(no e-mail)',
    createdAt: str(r.created_at) ?? '',
    lastSignInAt: str(r.last_sign_in_at),
    isAdmin: r.is_admin === true,
    cards: num(r.cards),
    cratePoints: num(r.crate_points),
    scans24h: num(r.scans_24h),
    errors7d: num(r.errors_7d),
  }
}

export function toAdminAction(r: unknown): AdminAction | null {
  if (!isRecord(r) || typeof r.id !== 'string') return null
  return {
    id: r.id,
    createdAt: str(r.created_at) ?? '',
    adminEmail: str(r.admin_email),
    targetEmail: str(r.target_email),
    points: typeof r.points === 'number' ? r.points : null,
    reason: str(r.reason) ?? '',
  }
}

/** Foutmelding bij het formulier, of null als het verstuurd mag worden. */
export function grantInputError(points: number, reason: string): string | null {
  if (!Number.isInteger(points) || points === 0) return 'Enter a whole number of points (negative takes points away).'
  if (Math.abs(points) > MAX_GRANT) return `At most ${MAX_GRANT.toLocaleString('en-GB')} points at once.`
  const why = reason.trim()
  if (why.length < REASON_MIN || why.length > REASON_MAX) return `Give a reason (${REASON_MIN} to ${REASON_MAX} characters).`
  return null
}

function missingFunction(error: { code?: string; message: string }): boolean {
  return error.code === 'PGRST202' || /could not find the function/i.test(error.message)
}

/** Ben ik beheerder? Zonder STAP21 of bij een fout: nee. */
export async function isAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin')
  if (error) {
    if (!missingFunction(error)) console.warn('Beheerder controleren mislukt', error)
    return false
  }
  return data === true
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('admin_list_users')
  if (error) throw new Error(`Loading users failed: ${error.message}`)
  return (Array.isArray(data) ? data : []).flatMap((r) => {
    const u = toAdminUser(r)
    return u ? [u] : []
  })
}

export async function listAdminActions(limit = 50): Promise<AdminAction[]> {
  const { data, error } = await supabase.rpc('admin_recent_actions', { p_limit: limit })
  if (error) throw new Error(`Loading the log failed: ${error.message}`)
  return (Array.isArray(data) ? data : []).flatMap((r) => {
    const a = toAdminAction(r)
    return a ? [a] : []
  })
}

/** Punten toekennen (positief) of afhalen (negatief); geeft de nieuwe stand. */
export async function grantCratePoints(userId: string, points: number, reason: string): Promise<number> {
  const problem = grantInputError(points, reason)
  if (problem) throw new Error(problem)
  const { data, error } = await supabase.rpc('admin_grant_points', { p_user: userId, p_points: points, p_reason: reason.trim() })
  if (error) throw new Error(error.message)
  return num(data)
}
