// Supabase Edge Function: herkent een Pokémon-kaart op een foto met Claude.
// Eerst Claude Haiku 5.5 (goedkoop); bij twijfel of weigering opnieuw met Claude Sonnet 5.5.
// Vereist secret ANTHROPIC_API_KEY (Dashboard → Edge Functions → Secrets).
import Anthropic from 'npm:@anthropic-ai/sdk@0.130.0'

const ALLOWED_ORIGINS = ['https://larsj95.github.io', 'http://localhost:5173', 'http://localhost:4173']
const MAX_BASE64_CHARS = 4_000_000 // ~3 MB afbeelding; de app stuurt ±200 KB (kaart) tot ±1 MB (binderpagina)
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type MediaType = (typeof MEDIA_TYPES)[number]

const PRIMARY_MODEL = 'claude-haiku-5-5'
const FALLBACK_MODEL = 'claude-sonnet-5-5'

const LANGUAGES = ['en', 'ja', 'zh-cn', 'zh-tw', 'ko', 'nl', 'de', 'fr', 'it', 'es', 'pt', 'other'] as const

const CARD_FIELDS = {
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
    notes: { type: 'string', description: 'Short explanation in English when unsure; otherwise empty. Always English, never Dutch.' },
} as const
const CARD_REQUIRED = Object.keys(CARD_FIELDS)

const SINGLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_card', ...CARD_REQUIRED],
  properties: {
    is_card: { type: 'boolean', description: 'True als de foto een Pokémon-ruilkaart toont.' },
    ...CARD_FIELDS,
  },
}

const MULTI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['cards'],
  properties: {
    cards: {
      type: 'array',
      description: 'Alle zichtbare Pokémon-kaarten, in leesvolgorde (links→rechts, boven→onder).',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['position', ...CARD_REQUIRED],
        properties: {
          position: { type: 'integer', description: 'Volgnummer in leesvolgorde, beginnend bij 1.' },
          ...CARD_FIELDS,
        },
      },
    },
  },
}

const RULES = `- Lees naam, setafkorting en kaartnummer letterlijk van de kaart (onderrand). Gok geen setcode die je niet kunt lezen.
- De regulation mark (losse letter in een kadertje) is geen setcode.
- variant: "reverse" alleen als het glimmende patroon over de hele kaart behalve de illustratie loopt; "holo" als alleen de illustratie glimt; anders "normal" of "unknown".
- confidence: "high" alleen als naam én nummer goed leesbaar zijn.
- notes: schrijf altijd in het Engels (de app is Engelstalig), kort, en alleen bij twijfel.`

const SINGLE_PROMPT = `Identificeer de Pokémon-ruilkaart op deze foto en vul de velden in.
${RULES}
- Is het geen Pokémon-kaart, zet is_card op false en laat de rest leeg (language "other", variant "unknown", confidence "low").`

const MULTI_PROMPT = `Deze foto toont meerdere Pokémon-ruilkaarten, bijvoorbeeld een binderpagina. Geef voor elke kaart die je ziet de velden, in leesvolgorde (links→rechts, boven→onder).
${RULES}
- Sla lege vakken en kaartachterkanten over. Neem een kaart alleen op als je hem echt ziet.`

const MAX_CARDS = 20

interface CardFields {
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

type Mode = 'single' | 'multi'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function isCardFields(v: unknown): v is CardFields {
  return isRecord(v) && typeof v.name_english === 'string' && typeof v.card_number === 'string' && typeof v.confidence === 'string'
}

/** Antwoord van het model → lijst kaarten (enkelvoudig: 0 of 1). null = onbruikbaar antwoord. */
function parseCards(text: string, mode: Mode): CardFields[] | null {
  try {
    const v: unknown = JSON.parse(text)
    if (mode === 'single') {
      if (!isRecord(v) || typeof v.is_card !== 'boolean') return null
      return v.is_card && isCardFields(v) ? [v] : []
    }
    if (!isRecord(v) || !Array.isArray(v.cards)) return null
    return v.cards.filter(isCardFields).slice(0, MAX_CARDS)
  } catch {
    return null
  }
}

async function recognize(
  client: Anthropic,
  model: typeof PRIMARY_MODEL | typeof FALLBACK_MODEL,
  mode: Mode,
  mediaType: MediaType,
  data: string,
): Promise<{ cards: CardFields[] | null; refused: boolean }> {
  const request = {
    model,
    // Ruimte voor (adaptief) denken plus het JSON-antwoord; een binderpagina heeft er meer nodig.
    max_tokens: mode === 'multi' ? 12000 : 4096,
    output_config: {
      effort: 'low' as const,
      format: { type: 'json_schema' as const, schema: mode === 'multi' ? MULTI_SCHEMA : SINGLE_SCHEMA },
    },
    messages: [
      {
        role: 'user' as const,
        content: [
          { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType, data } },
          { type: 'text' as const, text: mode === 'multi' ? MULTI_PROMPT : SINGLE_PROMPT },
        ],
      },
    ],
  }
  // Sonnet 5.5: server-side fallback bij een weigering (Haiku 5.5 ondersteunt dit niet).
  const response =
    model === FALLBACK_MODEL
      ? await client.beta.messages.create({ ...request, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(request)

  if (response.stop_reason === 'refusal') return { cards: null, refused: true }
  for (const block of response.content) {
    if (block.type === 'text') return { cards: parseCards(block.text, mode), refused: false }
  }
  return { cards: null, refused: false }
}

/** Wanneer de duurdere tweede poging de moeite waard is. */
function needsFallback(cards: CardFields[] | null, refused: boolean, mode: Mode): boolean {
  if (!cards || refused) return true
  // Eén kaart: bij elke twijfel. Binderpagina: alleen als een kaart echt onleesbaar is (kosten).
  return mode === 'single'
    ? cards.some((c) => c.confidence !== 'high')
    : cards.length === 0 || cards.some((c) => c.confidence === 'low')
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405, origin)

  try {
    if (!(await isSignedIn(req))) return json({ error: 'Not signed in.' }, 401, origin)

    const body: unknown = await req.json().catch(() => null)
    const image = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null
    const data = typeof image?.data === 'string' ? image.data : ''
    const mediaType = MEDIA_TYPES.find((m) => m === image?.media_type)
    const mode: Mode = image?.mode === 'multi' ? 'multi' : 'single'
    if (!mediaType || !data || data.length > MAX_BASE64_CHARS || !/^[A-Za-z0-9+/]+=*$/.test(data)) {
      return json({ error: 'Invalid or too large image.' }, 400, origin)
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY is missing from the Edge Function secrets.' }, 500, origin)
    const client = new Anthropic({ apiKey })

    let model: string = PRIMARY_MODEL
    let { cards, refused } = await recognize(client, PRIMARY_MODEL, mode, mediaType, data)
    // Twijfel, onleesbaar of geweigerd → tweede poging met het sterkere model.
    if (needsFallback(cards, refused, mode)) {
      const second = await recognize(client, FALLBACK_MODEL, mode, mediaType, data)
      if (second.cards) {
        cards = second.cards
        refused = false
        model = FALLBACK_MODEL
      } else if (second.refused) {
        refused = true
      }
    }

    if (!cards) {
      return json({ error: refused ? 'This photo could not be processed.' : 'No card recognised. Try a sharper photo.' }, 422, origin)
    }
    return json({ cards, model }, 200, origin)
  } catch (err) {
    console.error('recognize-card', err)
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'Too many scans right now; try again shortly.' }, 429, origin)
    if (err instanceof Anthropic.AuthenticationError) return json({ error: 'Invalid Anthropic API key.' }, 500, origin)
    if (err instanceof Anthropic.APIError) return json({ error: `Recognition failed (${err.status}).` }, 502, origin)
    return json({ error: 'Recognition failed.' }, 500, origin)
  }
})
