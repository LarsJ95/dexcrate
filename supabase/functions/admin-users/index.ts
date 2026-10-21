// Supabase Edge Function: accounts beheren voor beheerders (STAP21/22): uitnodigen, blokkeren, deblokkeren, verwijderen.
// Wie beheerder is bepaalt de database (is_admin); deze functie controleert dat bij elk verzoek.
// Gebruikt de geheime serversleutel die Supabase zelf aan Edge Functions geeft (SUPABASE_SERVICE_ROLE_KEY, of bij de
// nieuwe sleutels SUPABASE_SECRET_KEYS); die komt nooit in de app. Geen eigen secrets nodig.
// Deploy: Supabase → Edge Functions → nieuwe functie, naam "admin-users", dit bestand plakken; "Verify JWT" aan laten.

const ALLOWED_ORIGINS = ['https://dexcrate.com', 'https://www.dexcrate.com', 'https://larsj95.github.io', 'http://localhost:5173', 'http://localhost:4173']
const APP_URL = 'https://dexcrate.com/app/'
const BUCKETS = ['card-photos', 'receipts'] as const
/** "Voor altijd" blokkeren: 100 jaar. */
const BAN_FOREVER = '876000h'
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } })
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Serversleutel: de oude service_role-JWT of de eerste nieuwe geheime sleutel. */
function serviceKey(): { key: string; kind: 'legacy' | 'secret' } | null {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return { key: legacy, kind: legacy.startsWith('sb_secret_') ? 'secret' : 'legacy' }
  try {
    const keys: unknown = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')
    const first = isRecord(keys) ? Object.values(keys).find((v): v is string => typeof v === 'string' && v.length > 0) : undefined
    return first ? { key: first, kind: 'secret' } : null
  } catch {
    return null
  }
}

/** Kopregels met de serversleutel. Nieuwe sleutels (sb_secret_…) alleen als apikey, de oude JWT ook als Bearer. */
function serviceHeaders(): Record<string, string> {
  const k = serviceKey()
  if (!k) throw new HttpError(500, 'The server key is missing in this Edge Function.')
  return k.kind === 'secret' ? { apikey: k.key, 'Content-Type': 'application/json' } : { apikey: k.key, Authorization: `Bearer ${k.key}`, 'Content-Type': 'application/json' }
}

const base = (): string => {
  const url = Deno.env.get('SUPABASE_URL')
  if (!url) throw new HttpError(500, 'SUPABASE_URL is missing.')
  return url
}

/** Ingelogde aanroeper die beheerder is; anders een fout. */
async function requireAdmin(req: Request): Promise<{ id: string; email: string | null }> {
  const auth = req.headers.get('Authorization')
  const apikey = req.headers.get('apikey')
  if (!auth?.startsWith('Bearer ') || !apikey) throw new HttpError(401, 'Not signed in.')
  const me = await fetch(`${base()}/auth/v1/user`, { headers: { Authorization: auth, apikey } })
  const user: unknown = await me.json().catch(() => null)
  if (!me.ok || !isRecord(user) || typeof user.id !== 'string') throw new HttpError(401, 'Not signed in.')
  const check = await fetch(`${base()}/rest/v1/rpc/is_admin`, { method: 'POST', headers: { Authorization: auth, apikey, 'Content-Type': 'application/json' }, body: '{}' })
  if (!check.ok || (await check.json().catch(() => false)) !== true) throw new HttpError(403, 'Not allowed.')
  return { id: user.id, email: typeof user.email === 'string' ? user.email : null }
}

async function call(path: string, init: RequestInit, what: string): Promise<unknown> {
  const res = await fetch(`${base()}${path}`, { ...init, headers: { ...serviceHeaders(), ...(init.headers ?? {}) } })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = isRecord(body) ? (body.msg ?? body.message ?? body.error_description ?? body.error) : null
    throw new HttpError(res.status >= 500 ? 502 : 400, `${what}: ${typeof msg === 'string' ? msg : res.status}`)
  }
  return body
}

/** Regel in het beheerlogboek (STAP22: admin_log). */
async function log(admin: string, target: string | null, action: string, reason: string, details: Record<string, unknown>): Promise<void> {
  await call('/rest/v1/rpc/admin_log', { method: 'POST', body: JSON.stringify({ p_admin: admin, p_target: target, p_action: action, p_points: null, p_reason: reason, p_details: details }) }, 'Writing the log failed')
}

async function getUser(id: string): Promise<{ id: string; email: string | null }> {
  const u = await call(`/auth/v1/admin/users/${id}`, { method: 'GET' }, 'User not found')
  if (!isRecord(u) || typeof u.id !== 'string') throw new HttpError(400, 'User not found.')
  return { id: u.id, email: typeof u.email === 'string' ? u.email : null }
}

async function isAdminUser(id: string): Promise<boolean> {
  const rows = await call(`/rest/v1/admins?user_id=eq.${id}&select=user_id`, { method: 'GET' }, 'Checking admins failed')
  return Array.isArray(rows) && rows.length > 0
}

/** Alle bestanden onder een map in een bucket (ook submappen). */
async function listFiles(bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 4) return []
  const out: string[] = []
  for (let offset = 0; ; offset += 100) {
    const list = await call(`/storage/v1/object/list/${bucket}`, { method: 'POST', body: JSON.stringify({ prefix, limit: 100, offset }) }, 'Listing files failed')
    const entries = Array.isArray(list) ? list.filter(isRecord) : []
    for (const e of entries) {
      if (typeof e.name !== 'string') continue
      const path = `${prefix}/${e.name}`
      if (e.id === null) out.push(...(await listFiles(bucket, path, depth + 1)))
      else out.push(path)
    }
    if (entries.length < 100) return out
  }
}

async function removeFiles(userId: string): Promise<number> {
  let removed = 0
  for (const bucket of BUCKETS) {
    const paths = await listFiles(bucket, userId)
    for (let i = 0; i < paths.length; i += 100) {
      await call(`/storage/v1/object/${bucket}`, { method: 'DELETE', body: JSON.stringify({ prefixes: paths.slice(i, i + 100) }) }, 'Removing files failed')
      removed += Math.min(100, paths.length - i)
    }
  }
  return removed
}

const reasonOf = (v: unknown): string => {
  const r = typeof v === 'string' ? v.trim() : ''
  if (r.length < 3 || r.length > 200) throw new HttpError(400, 'Give a reason (3 to 200 characters).')
  return r
}

const userIdOf = (v: unknown): string => {
  if (typeof v !== 'string' || !UUID.test(v)) throw new HttpError(400, 'Invalid user.')
  return v
}

async function handle(req: Request, body: Record<string, unknown>): Promise<unknown> {
  const action = body.action
  if (action === 'health') {
    await requireAdmin(req)
    return { ok: true, serverKey: serviceKey()?.kind ?? 'missing' }
  }
  const admin = await requireAdmin(req)

  if (action === 'invite') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!EMAIL.test(email)) throw new HttpError(400, 'Enter a valid e-mail address.')
    const u = await call(`/auth/v1/invite?redirect_to=${encodeURIComponent(APP_URL)}`, { method: 'POST', body: JSON.stringify({ email }) }, 'Inviting failed')
    const id = isRecord(u) && typeof u.id === 'string' ? u.id : null
    await log(admin.id, id, 'invite', `Invited ${email}`, { email })
    return { ok: true, userId: id }
  }

  const userId = userIdOf(body.userId)
  if (userId === admin.id) throw new HttpError(400, 'You cannot do this to your own account.')
  const target = await getUser(userId)

  if (action === 'ban' || action === 'unban') {
    const reason = reasonOf(body.reason)
    if (action === 'ban' && (await isAdminUser(userId))) throw new HttpError(400, 'Remove admin rights first (SQL: delete from public.admins …).')
    await call(`/auth/v1/admin/users/${userId}`, { method: 'PUT', body: JSON.stringify({ ban_duration: action === 'ban' ? BAN_FOREVER : 'none' }) }, 'Updating the account failed')
    await log(admin.id, userId, action, reason, { email: target.email })
    return { ok: true }
  }

  if (action === 'delete') {
    const reason = reasonOf(body.reason)
    const confirm = typeof body.confirmEmail === 'string' ? body.confirmEmail.trim().toLowerCase() : ''
    if (!target.email || confirm !== target.email.toLowerCase()) throw new HttpError(400, 'Type the e-mail address of the account to confirm.')
    if (await isAdminUser(userId)) throw new HttpError(400, 'Remove admin rights first (SQL: delete from public.admins …).')
    // Eerst loggen zonder koppeling (de koppeling verdwijnt met het account), dan bestanden, dan het account (de database
    // wist alle rijen van de gebruiker zelf: overal on delete cascade).
    await log(admin.id, null, 'delete_user', reason, { email: target.email, user_id: userId })
    const files = await removeFiles(userId)
    await call(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' }, 'Deleting the account failed')
    return { ok: true, filesRemoved: files }
  }

  throw new HttpError(400, 'Unknown action.')
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405, origin)
  try {
    const body: unknown = await req.json().catch(() => null)
    if (!isRecord(body)) return json({ error: 'Invalid request.' }, 400, origin)
    return json(await handle(req, body), 200, origin)
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status, origin)
    console.error('admin-users', err)
    return json({ error: 'Something went wrong.' }, 500, origin)
  }
})
