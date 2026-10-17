// Supabase Edge Function: zoekt een kaart op PriceCharting en geeft de resultaatregels terug
// (titel, set, plaatje). De app kiest zelf de juiste regel (src/lib/pricecharting.ts).
// Laatste redmiddel voor kaartfoto's die TCGdex, Limitless en pokemontcg.io niet hebben.
// PriceCharting stuurt geen CORS-headers mee, daarom loopt dit via de server. Geen secrets nodig.

// dexcrate.com sinds 17-10-2026; het oude GitHub-adres blijft tot de verhuizing klaar is.
const ALLOWED_ORIGINS = ['https://dexcrate.com', 'https://www.dexcrate.com', 'https://larsj95.github.io', 'http://localhost:5173', 'http://localhost:4173']
const SEARCH = 'https://www.pricecharting.com/search-products?type=prices&q='
const USER_AGENT = 'Mozilla/5.0 (compatible; Dexcrate card-image lookup)'
const MAX_QUERY = 120
const MAX_ROWS = 60

interface Row {
  title: string
  console: string
  /** Plaatjes-id bij PriceCharting: storage.googleapis.com/images.pricecharting.com/<hash>/<maat>.jpg */
  hash: string
}

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

/** Alleen echte ingelogde gebruikers (geen anonieme/publieke sleutel). */
async function isSignedIn(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization')
  const apikey = req.headers.get('apikey')
  const url = Deno.env.get('SUPABASE_URL')
  if (!auth?.startsWith('Bearer ') || !apikey || !url) return false
  const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey } })
  if (!res.ok) return false
  const user: unknown = await res.json()
  return typeof user === 'object' && user !== null && typeof (user as { id?: unknown }).id === 'string'
}

const text = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

/** Zoekresultatenpagina: één regel per product. */
function parseRows(html: string): Row[] {
  const rows: Row[] = []
  for (const m of html.matchAll(/<tr id="product-\d+"[\s\S]*?<\/tr>/g)) {
    const row = m[0]
    const img = row.match(/images\.pricecharting\.com\/([a-z0-9]+)\/\d+\.jpg/)
    const title = row.match(/<td class="title">\s*<a [^>]*>([\s\S]*?)<\/a>/)
    const consoleName = row.match(/<div class="console-in-title">[\s\S]*?<a [^>]*>([\s\S]*?)<\/a>/)
    if (img && title) rows.push({ title: text(title[1]), console: consoleName ? text(consoleName[1]) : '', hash: img[1] })
    if (rows.length >= MAX_ROWS) break
  }
  return rows
}

/** Eén treffer: PriceCharting stuurt door naar de productpagina. */
function parseProduct(html: string): Row | null {
  const img = html.match(/images\.pricecharting\.com\/([a-z0-9]+)\/1600\.jpg/)
  const h1 = html.match(/<h1 id="product_name"[^>]*>([\s\S]*?)<a [^>]*>([\s\S]*?)<\/a>/)
  if (!img || !h1) return null
  return { title: text(h1[1]), console: text(h1[2]), hash: img[1] }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405, origin)

  try {
    if (!(await isSignedIn(req))) return json({ error: 'Not signed in.' }, 401, origin)
    const body: unknown = await req.json().catch(() => null)
    const q = typeof body === 'object' && body !== null ? (body as { q?: unknown }).q : null
    if (typeof q !== 'string' || q.trim().length < 2 || q.length > MAX_QUERY) return json({ error: 'Invalid query.' }, 400, origin)

    const res = await fetch(SEARCH + encodeURIComponent(q.trim()), { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' } })
    if (!res.ok) return json({ error: `PriceCharting ${res.status}` }, 502, origin)
    const html = await res.text()
    const single = res.url.includes('/search-products') ? null : parseProduct(html)
    return json({ rows: single ? [single] : parseRows(html) }, 200, origin)
  } catch (err) {
    console.error('card-image', err)
    return json({ error: 'Lookup failed.' }, 500, origin)
  }
})
