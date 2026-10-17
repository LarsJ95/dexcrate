// Lighthouse (mobiel: gesimuleerde middenklasse-telefoon + trage 4G) op de gebouwde app, ingelogd.
//
// Gebruik (vanuit app/):
//   npm run build
//   node tools/lighthouse.mjs [route ...]        bv. node tools/lighthouse.mjs overview collection sets wishlist scan
//
// Inloggen: zet in .env.local (staat niet in git, komt niet in de app):
//   LH_EMAIL=...
//   LH_PASSWORD=...
// Zonder die twee meet het script met een nep-sessie: de app laadt dan wel, maar Supabase weigert de data (401),
// wat foutmeldingen en wat verspringing oplevert die echte gebruikers niet zien.
//
// Chrome: CHROME_PATH, anders de Playwright-headless-shell in AppData. Lighthouse wordt via npx opgehaald
// (geen dependency van het project). Uitvoer: tools/lighthouse-out/lh-<route>.json (staat in .gitignore).
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const LIGHTHOUSE = 'lighthouse@13.5.0'
const PREVIEW_PORT = 4180
const DEBUG_PORT = 9341
const routes = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['overview', 'collection', 'sets', 'wishlist', 'scan']
const outDir = join('tools', 'lighthouse-out')
mkdirSync(outDir, { recursive: true })

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .map((l) => /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
)
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url ?? '')?.[1]
if (!ref || !key) throw new Error('VITE_SUPABASE_URL en VITE_SUPABASE_PUBLISHABLE_KEY ontbreken in .env.local.')

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const base = join(homedir(), 'AppData/Local/ms-playwright')
  const shell = existsSync(base) ? readdirSync(base).find((d) => d.startsWith('chromium_headless_shell')) : null
  if (!shell) throw new Error('Geen Chrome gevonden: zet CHROME_PATH.')
  const dir = join(base, shell)
  return join(dir, readdirSync(dir).find((d) => d.startsWith('chrome')), 'chrome-headless-shell.exe')
}

async function session() {
  if (env.LH_EMAIL && env.LH_PASSWORD) {
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: env.LH_EMAIL, password: env.LH_PASSWORD }),
    })
    if (!res.ok) throw new Error(`Inloggen mislukt (${res.status}). Controleer LH_EMAIL en LH_PASSWORD in .env.local.`)
    console.log('Ingelogd met het account uit .env.local (echte data).')
    return await res.json()
  }
  console.log('Geen LH_EMAIL/LH_PASSWORD in .env.local: meten met een nep-sessie (Supabase weigert de data).')
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 3600
  const id = '11111111-1111-1111-1111-111111111111'
  return { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: id, exp, role: 'authenticated' })}.sig`, refresh_token: 'x', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: { id, aud: 'authenticated', role: 'authenticated' } }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const base = `http://localhost:${PREVIEW_PORT}/`
// Rechtstreeks via Node (geen shell): dan stopt kill() ook echt de server.
const NPX = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')
const preview = spawn(process.execPath, [join('node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], { stdio: 'ignore' })
const chrome = spawn(chromePath(), [`--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'dexcrate-lh-'))}`, 'about:blank'], { stdio: 'ignore' })

function lighthouse(target, name, extra = []) {
  const out = join(outDir, `lh-${name}.json`)
  execFileSync(process.execPath, [NPX, '--yes', LIGHTHOUSE, target, `--port=${DEBUG_PORT}`, '--output=json', `--output-path=${out}`, '--only-categories=performance,accessibility,best-practices', '--quiet', ...extra], { stdio: 'ignore', timeout: 300000 })
  const r = JSON.parse(readFileSync(out, 'utf8'))
  const a = r.audits
  const score = (k) => Math.round((r.categories[k]?.score ?? 0) * 100)
  console.log(`${name.padEnd(12)} perf ${score('performance')}  a11y ${score('accessibility')}  bp ${score('best-practices')}  | LCP ${a['largest-contentful-paint'].displayValue}  TBT ${a['total-blocking-time'].displayValue}  CLS ${a['cumulative-layout-shift'].displayValue}`)
}

try {
  await sleep(4000)
  lighthouse(base, 'login-koud')
  const s = await session()
  const tab = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(base)}`, { method: 'PUT' })).json()
  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `localStorage.setItem('sb-${ref}-auth-token', ${JSON.stringify(JSON.stringify(s))}); 1` } }))
  await sleep(1500)
  ws.close()
  // Terugkerende gebruiker: opslag (sessie, service worker) niet wissen tussen de metingen.
  for (const r of routes) lighthouse(`${base}#/${r}`, r.replaceAll('/', '-'), ['--disable-storage-reset'])
} finally {
  chrome.kill()
  preview.kill()
}
