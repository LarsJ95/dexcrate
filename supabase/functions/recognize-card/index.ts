// Supabase Edge Function: herkent een Pokémon-kaart op een foto met Claude.
// Eerst Claude Haiku 5.5 (goedkoop); bij twijfel of weigering opnieuw met Claude Sonnet 5.5.
// Vereist secret ANTHROPIC_API_KEY (Dashboard → Edge Functions → Secrets).
import Anthropic from 'npm:@anthropic-ai/sdk@0.130.0'

const ALLOWED_ORIGINS = ['https://larsj95.github.io', 'http://localhost:5173', 'http://localhost:4173']
const MAX_BASE64_CHARS = 3_000_000 // ~2,2 MB afbeelding; de app stuurt ±200 KB
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type MediaType = (typeof MEDIA_TYPES)[number]

const PRIMARY_MODEL = 'claude-haiku-5-5'
const FALLBACK_MODEL = 'claude-sonnet-5-5'

const LANGUAGES = ['en', 'ja', 'zh-cn', 'zh-tw', 'ko', 'nl', 'de', 'fr', 'it', 'es', 'pt', 'other'] as const

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'is_card', 'name_printed', 'name_english', 'language', 'set_code', 'card_number',
    'set_total', 'regulation_mark', 'variant', 'confidence', 'notes',
  ],
  properties: {
    is_card: { type: 'boolean', description: 'True als de foto een Pokémon-ruilkaart toont.' },
    name_printed: { type: 'string', description: 'Kaartnaam zoals gedrukt, in de taal van de kaart.' },
    name_english: { type: 'string', description: 'Engelse kaartnaam inclusief suffix (bv. "Mew ex", "Oranguru V").' },
    language: { type: 'string', enum: LANGUAGES },
    set_code: {
      type: 'string',
      description: 'Gedrukte setafkorting linksonder (bv. "MEW", "OBF", "SV8"); leeg als niet zichtbaar. NIET de regulation mark.',
    },
    card_number: { type: 'string', description: 'Kaartnummer vóór de schuine streep (bv. "151" bij 151/165); leeg als onleesbaar.' },
    set_total: { type: 'string', description: 'Getal na de schuine streep (bv. "165"); leeg als afwezig.' },
    regulation_mark: { type: 'string', description: 'Losse letter in een kadertje linksonder (bv. "G", "H"); leeg als afwezig.' },
    variant: { type: 'string', enum: ['normal', 'holo', 'reverse', 'unknown'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    notes: { type: 'string', description: 'Korte toelichting bij twijfel; anders leeg.' },
  },
} as const

const PROMPT = `Identificeer de Pokémon-ruilkaart op deze foto en vul de velden in.
- Lees naam, setafkorting en kaartnummer letterlijk van de kaart (onderrand). Gok geen setcode die je niet kunt lezen.
- De regulation mark (losse letter in een kadertje) is geen setcode.
- variant: "reverse" alleen als het glimmende patroon over de hele kaart behalve de illustratie loopt; "holo" als alleen de illustratie glimt; anders "normal" of "unknown".
- confidence: "high" alleen als naam én nummer goed leesbaar zijn.
- Is het geen Pokémon-kaart, zet is_card op false en laat de rest leeg (language "other", variant "unknown", confidence "low").`

interface Recognition {
  is_card: boolean
  name_printed: string
  name_english: string
  language: (typeof LANGUAGES)[number]
  set_code: string
  card_number: string
  set_total: string
  regulation_mark: string
  variant: 'normal' | 'holo' | 'reverse' | 'unknown'
  confidence: 'high' | 'medium' | 'low'
  notes: string
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

function parseRecognition(text: string): Recognition | null {
  try {
    const v: unknown = JSON.parse(text)
    if (typeof v !== 'object' || v === null) return null
    const r = v as Record<string, unknown>
    if (typeof r.is_card !== 'boolean' || typeof r.name_english !== 'string' || typeof r.card_number !== 'string') return null
    return v as Recognition
  } catch {
    return null
  }
}

async function recognize(
  client: Anthropic,
  model: typeof PRIMARY_MODEL | typeof FALLBACK_MODEL,
  mediaType: MediaType,
  data: string,
): Promise<{ result: Recognition | null; refused: boolean }> {
  const request = {
    model,
    max_tokens: 4096, // ruimte voor (adaptief) denken plus het korte JSON-antwoord
    output_config: { effort: 'low' as const, format: { type: 'json_schema' as const, schema: SCHEMA } },
    messages: [
      {
        role: 'user' as const,
        content: [
          { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType, data } },
          { type: 'text' as const, text: PROMPT },
        ],
      },
    ],
  }
  // Sonnet 5.5: server-side fallback bij een weigering (Haiku 5.5 ondersteunt dit niet).
  const response =
    model === FALLBACK_MODEL
      ? await client.beta.messages.create({ ...request, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(request)

  if (response.stop_reason === 'refusal') return { result: null, refused: true }
  for (const block of response.content) {
    if (block.type === 'text') return { result: parseRecognition(block.text), refused: false }
  }
  return { result: null, refused: false }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'Alleen POST.' }, 405, origin)

  try {
    if (!(await isSignedIn(req))) return json({ error: 'Niet ingelogd.' }, 401, origin)

    const body: unknown = await req.json().catch(() => null)
    const image = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null
    const data = typeof image?.data === 'string' ? image.data : ''
    const mediaType = MEDIA_TYPES.find((m) => m === image?.media_type)
    if (!mediaType || !data || data.length > MAX_BASE64_CHARS || !/^[A-Za-z0-9+/]+=*$/.test(data)) {
      return json({ error: 'Ongeldige of te grote afbeelding.' }, 400, origin)
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY ontbreekt in de Edge Function secrets.' }, 500, origin)
    const client = new Anthropic({ apiKey })

    let model: string = PRIMARY_MODEL
    let { result, refused } = await recognize(client, PRIMARY_MODEL, mediaType, data)
    // Twijfel, onleesbaar of geweigerd → tweede poging met het sterkere model.
    if (!result || refused || (result.is_card && result.confidence !== 'high')) {
      const second = await recognize(client, FALLBACK_MODEL, mediaType, data)
      if (second.result) {
        result = second.result
        refused = false
        model = FALLBACK_MODEL
      } else if (second.refused) {
        refused = true
      }
    }

    if (!result) {
      return json({ error: refused ? 'De foto kon niet worden verwerkt.' : 'Geen kaart herkend. Probeer een scherpere foto.' }, 422, origin)
    }
    return json({ result, model }, 200, origin)
  } catch (err) {
    console.error('recognize-card', err)
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'Even te veel scans; probeer het zo opnieuw.' }, 429, origin)
    if (err instanceof Anthropic.AuthenticationError) return json({ error: 'Anthropic API-key ongeldig.' }, 500, origin)
    if (err instanceof Anthropic.APIError) return json({ error: `Herkenning mislukt (${err.status}).` }, 502, origin)
    return json({ error: 'Herkenning mislukt.' }, 500, origin)
  }
})
