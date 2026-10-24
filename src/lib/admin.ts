import { notifyCrateChanged } from './crate'
import { fetchAllPages } from './fetchAll'
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
  /** STAP22; 0 zonder STAP22. */
  scans30d: number
  errors7d: number
  /** Eigen scanlimiet (STAP22); null = standaard. */
  scanPerMinute: number | null
  scanPerDay: number | null
  /** Geblokkeerd tot (admin-users); null = niet geblokkeerd. */
  bannedUntil: string | null
}

export interface AdminAction {
  id: string
  createdAt: string
  adminEmail: string | null
  targetEmail: string | null
  /** grant_points, set_rules, set_scan_limit, announce, invite, ban, unban, delete_user. */
  action: string
  points: number | null
  reason: string
  details: Record<string, unknown> | null
}

export interface LedgerEntry {
  createdAt: string
  kind: string
  ref: string
  points: number
}

export interface UserError {
  createdAt: string
  message: string
  context: string | null
  appBuild: string | null
  userAgent: string | null
  stack: string | null
}

export interface ScanDay {
  day: string
  scans: number
  users: number
}

/** Crate-regels zoals in crate_config (STAP22); alles hele getallen. */
export interface AdminCrateRules {
  daily: number
  trade_factor: number
  crate_set: number
  packs: Record<'booster' | 'great' | 'master' | 'set' | 'type', number>
  craft: Record<'common' | 'uncommon' | 'rare' | 'double' | 'illustration' | 'special', number>
}

export const PACK_KEYS = ['booster', 'great', 'master', 'set', 'type'] as const
export const CRAFT_KEYS = ['common', 'uncommon', 'rare', 'double', 'illustration', 'special'] as const

/** Geschatte kosten per scan (Haiku; Sonnet-terugval kost meer): alleen een indicatie. */
export const SCAN_COST_EUR = 0.001

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
    scans30d: num(r.scans_30d),
    errors7d: num(r.errors_7d),
    scanPerMinute: typeof r.scan_per_minute === 'number' ? r.scan_per_minute : null,
    scanPerDay: typeof r.scan_per_day === 'number' ? r.scan_per_day : null,
    bannedUntil: str(r.banned_until),
  }
}

export function toAdminAction(r: unknown): AdminAction | null {
  if (!isRecord(r) || typeof r.id !== 'string') return null
  return {
    id: r.id,
    createdAt: str(r.created_at) ?? '',
    adminEmail: str(r.admin_email),
    targetEmail: str(r.target_email),
    action: str(r.action) ?? 'grant_points',
    points: typeof r.points === 'number' ? r.points : null,
    reason: str(r.reason) ?? '',
    details: isRecord(r.details) ? r.details : null,
  }
}

/** Geblokkeerd op dit moment (banned_until in de toekomst). */
export const isBanned = (u: Pick<AdminUser, 'bannedUntil'>, now = Date.now()): boolean => u.bannedUntil !== null && Date.parse(u.bannedUntil) > now

/** Regels uit crate_rules(); ontbrekende waarden = de startwaarden van STAP22. */
export function toAdminRules(v: unknown): AdminCrateRules {
  const o = isRecord(v) ? v : {}
  const int = (x: unknown, fallback: number): number => (typeof x === 'number' && Number.isInteger(x) ? x : fallback)
  const packs = isRecord(o.packs) ? o.packs : {}
  const craft = isRecord(o.craft) ? o.craft : {}
  const PACK_DEFAULTS = { booster: 100, great: 200, master: 1000, set: 150, type: 300 }
  const CRAFT_DEFAULTS = { common: 120, uncommon: 180, rare: 300, double: 600, illustration: 900, special: 1800 }
  return {
    daily: int(o.daily, 150),
    trade_factor: int(o.trade_factor, 2),
    crate_set: int(o.crate_set, 500),
    packs: Object.fromEntries(PACK_KEYS.map((k) => [k, int(packs[k], PACK_DEFAULTS[k])])) as AdminCrateRules['packs'],
    craft: Object.fromEntries(CRAFT_KEYS.map((k) => [k, int(craft[k], CRAFT_DEFAULTS[k])])) as AdminCrateRules['craft'],
  }
}

/** Fout van een beheerfunctie die nog niet bestaat: STAP-bestand nog niet gedraaid. */
export class MissingStepError extends Error {
  constructor(step: string) {
    super(`Not set up yet: run ${step} in Supabase.`)
    this.name = 'MissingStepError'
  }
}

async function call(fn: string, args: Record<string, unknown> | undefined, step: string, what: string): Promise<unknown> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    if (missingFunction(error)) throw new MissingStepError(step)
    throw new Error(`${what}: ${error.message}`)
  }
  return data
}

const rows = (data: unknown): unknown[] => (Array.isArray(data) ? data : [])

/** Foutmelding bij het formulier, of null als het verstuurd mag worden. */
export function grantInputError(points: number, reason: string): string | null {
  if (!Number.isInteger(points) || points === 0) return 'Enter a whole number of points (negative takes points away).'
  if (Math.abs(points) > MAX_GRANT) return `At most ${MAX_GRANT.toLocaleString('en-GB')} points at once.`
  return reasonError(reason)
}

/** Reden 3 tot 200 tekens (zoals admin_reason in STAP22). */
export function reasonError(reason: string): string | null {
  const why = reason.trim()
  return why.length < REASON_MIN || why.length > REASON_MAX ? `Give a reason (${REASON_MIN} to ${REASON_MAX} characters).` : null
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

/** Alle gebruikers, oudste account eerst (zelfde volgorde als de functie; user_id maakt hem uniek voor de pagina's). */
export async function listAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await fetchAllPages((from, to) =>
    supabase.rpc('admin_list_users').order('created_at', { ascending: true }).order('user_id', { ascending: true }).range(from, to),
  )
  if (error) throw new Error(`Loading users failed: ${error.message}`)
  return data.flatMap((r) => {
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

export async function listUserLedger(userId: string, limit = 100): Promise<LedgerEntry[]> {
  return rows(await call('admin_user_ledger', { p_user: userId, p_limit: limit }, 'STAP22', 'Loading points history failed')).flatMap((r) =>
    isRecord(r) && typeof r.kind === 'string' ? [{ createdAt: str(r.created_at) ?? '', kind: r.kind, ref: str(r.ref) ?? '', points: num(r.points) }] : [],
  )
}

export async function listUserErrors(userId: string, limit = 50): Promise<UserError[]> {
  return rows(await call('admin_user_errors', { p_user: userId, p_limit: limit }, 'STAP22', 'Loading errors failed')).flatMap((r) =>
    isRecord(r) && typeof r.message === 'string'
      ? [{ createdAt: str(r.created_at) ?? '', message: r.message, context: str(r.context), appBuild: str(r.app_build), userAgent: str(r.user_agent), stack: str(r.stack) }]
      : [],
  )
}

export async function getScanStats(days = 14): Promise<ScanDay[]> {
  return rows(await call('admin_scan_stats', { p_days: days }, 'STAP22', 'Loading scans failed')).flatMap((r) =>
    isRecord(r) && typeof r.day === 'string' ? [{ day: r.day, scans: num(r.scans), users: num(r.users) }] : [],
  )
}

/** Allebei null = terug naar de standaard (40 per minuut, 500 per dag). */
export async function setScanLimit(userId: string, perMinute: number | null, perDay: number | null, reason: string): Promise<void> {
  await call('admin_set_scan_limit', { p_user: userId, p_per_minute: perMinute, p_per_day: perDay, p_reason: reason.trim() }, 'STAP22', 'Saving the scan limit failed')
}

export async function getAdminRules(): Promise<AdminCrateRules> {
  return toAdminRules(await call('crate_rules', undefined, 'STAP18', 'Loading the Crate rules failed'))
}

export async function setAdminRules(rules: Partial<AdminCrateRules>, reason: string): Promise<AdminCrateRules> {
  return toAdminRules(await call('admin_set_crate_rules', { p_rules: rules, p_reason: reason.trim() }, 'STAP22', 'Saving the rules failed'))
}

/** Lege tekst = mededeling weghalen. */
export async function setAnnouncement(message: string, level: 'info' | 'warning'): Promise<void> {
  await call('admin_set_announcement', { p_message: message.trim(), p_level: level }, 'STAP22', 'Saving the announcement failed')
}

/** Punten toekennen (positief) of afhalen (negatief); geeft de nieuwe stand. */
export async function grantCratePoints(userId: string, points: number, reason: string): Promise<number> {
  const problem = grantInputError(points, reason)
  if (problem) throw new Error(problem)
  const { data, error } = await supabase.rpc('admin_grant_points', { p_user: userId, p_points: points, p_reason: reason.trim() })
  if (error) throw new Error(error.message)
  // Misschien je eigen account: menu laten bijwerken (een ander account kost alleen één extra opvraging).
  notifyCrateChanged()
  return num(data)
}
