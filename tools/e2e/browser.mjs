// Hulpmiddelen voor de browsertests: headless Chrome via het DevTools-protocol (geen extra dependency).
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** CHROME_PATH, anders de Playwright-headless-shell in AppData (zoals tools/lighthouse.mjs). */
export function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const base = join(homedir(), 'AppData/Local/ms-playwright')
  const shell = existsSync(base) ? readdirSync(base).find((d) => d.startsWith('chromium_headless_shell')) : null
  if (!shell) throw new Error('Geen Chrome gevonden: zet CHROME_PATH.')
  const dir = join(base, shell)
  return join(dir, readdirSync(dir).find((d) => d.startsWith('chrome')), 'chrome-headless-shell.exe')
}

/** Supabase-projectref uit .env.local (de app praat met https://<ref>.supabase.co). */
export function supabaseRef() {
  const m = /VITE_SUPABASE_URL=\s*["']?https:\/\/([a-z0-9]+)\.supabase\.co/.exec(readFileSync('.env.local', 'utf8'))
  if (!m) throw new Error('VITE_SUPABASE_URL ontbreekt in .env.local.')
  return m[1]
}

/** Nep-sessie: de app denkt dat je ingelogd bent; alle Supabase-verzoeken worden door de test beantwoord. */
export function fakeSession(email = 'e2e@test') {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 3600
  const id = '11111111-1111-1111-1111-111111111111'
  return {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, exp, role: 'authenticated' })}.sig`,
    refresh_token: 'r',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    user: { id, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
  }
}

const CORS = [
  { name: 'Content-Type', value: 'application/json' },
  { name: 'Access-Control-Allow-Origin', value: '*' },
  { name: 'Access-Control-Allow-Headers', value: '*' },
  { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, DELETE, OPTIONS' },
]

let nextPort = 9350

/**
 * Start een eigen Chrome (eigen profiel) en geeft een pagina terug.
 * `onRequest(req)` beantwoordt onderschepte verzoeken: { status, body } of 'fail' (geen netwerk).
 */
export async function openBrowser({ width = 412, height = 900 } = {}) {
  const port = nextPort++
  // Gewone Chrome (CHROME_PATH, bv. in CI) moet expliciet headless; de headless-shell is dat altijd.
  // In CI (GitHub Actions, Ubuntu) start Chrome niet met zijn sandbox.
  const extra = [...(process.env.CHROME_PATH ? ['--headless=new'] : []), ...(process.env.CI ? ['--no-sandbox'] : [])]
  const proc = spawn(chromePath(), [...extra, `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'dexcrate-e2e-'))}`, `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' })
  let target
  // Tot 30 s: de eerste start op een koude CI-machine duurde soms langer dan 15 s (24-10-2026).
  for (let i = 0; i < 150 && !target; i++) {
    await sleep(200)
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')
    } catch {
      // Chrome start nog.
    }
  }
  if (!target) {
    proc.kill()
    throw new Error('Chrome start niet.')
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let id = 0
  const pending = new Map()
  let onRequest = null
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id
      pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)))
      ws.send(JSON.stringify({ id: n, method, params }))
    })
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    }
    if (m.method !== 'Fetch.requestPaused' || !onRequest) return
    const req = m.params.request
    const requestId = m.params.requestId
    if (req.method === 'OPTIONS') {
      ws.send(JSON.stringify({ id: ++id, method: 'Fetch.fulfillRequest', params: { requestId, responseCode: 204, responseHeaders: CORS, body: '' } }))
      return
    }
    const answer = onRequest(req)
    if (answer === 'fail') {
      ws.send(JSON.stringify({ id: ++id, method: 'Fetch.failRequest', params: { requestId, errorReason: 'InternetDisconnected' } }))
      return
    }
    ws.send(JSON.stringify({ id: ++id, method: 'Fetch.fulfillRequest', params: { requestId, responseCode: answer.status ?? 200, responseHeaders: CORS, body: Buffer.from(answer.body ?? '[]').toString('base64') } }))
  })

  const page = {
    send,
    /** Voert JavaScript uit in de pagina en geeft de (JSON-)waarde terug. */
    async ev(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(`In de pagina: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
      return r.result.value
    },
    async goto(url, wait = 3000) {
      await send('Page.navigate', { url })
      await sleep(wait)
    },
    async reload(wait = 3000) {
      await send('Page.reload')
      await sleep(wait)
    },
    /** Alle verzoeken naar Supabase beantwoordt `handler` (zie openBrowser). */
    async mockSupabase(ref, handler) {
      onRequest = handler
      await send('Fetch.enable', { patterns: [{ urlPattern: `https://${ref}.supabase.co/*` }] })
    },
    /** Zet de nep-sessie in localStorage; daarna herladen. */
    async signIn(ref, session = fakeSession()) {
      await page.ev(`localStorage.setItem('sb-${ref}-auth-token', ${JSON.stringify(JSON.stringify(session))}); 1`)
    },
    async offline(on) {
      await send('Network.enable')
      await send('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    },
    close() {
      ws.close()
      proc.kill()
    },
  }
  await send('Runtime.enable')
  return page
}

/** Standaardantwoord op Supabase-verzoeken: lege lijsten, RPC null, auth leeg. */
export function supabaseAnswer(req, tables = {}) {
  const u = req.url
  for (const [table, body] of Object.entries(tables)) if (u.includes(`/rest/v1/${table}`)) return { body }
  if (u.includes('/rest/v1/rpc/')) return { body: 'null' }
  if (u.includes('/auth/v1/')) return { body: '{}' }
  return { body: '[]' }
}
