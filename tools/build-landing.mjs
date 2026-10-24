// Zet de landingspagina in dist/ naast de app (dist/app, door Vite gebouwd). Draait na `vite build` (zie package.json).
// - landing/* → dist/ (index.html, 404.html, robots.txt, sw.js, og-image.png)
// - favicons uit public/ en het lettertype Archivo (met licentie) erbij
// - sitemap.xml met de bouwdatum als lastmod
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'
const SITE = 'https://dexcrate.com/'
if (!existsSync(join(DIST, 'app', 'index.html'))) throw new Error('Geen app-build in dist/app: draai eerst vite build.')

// Oude bestanden in de hoofdmap weg (bv. van een build van vóór de verhuizing); de app in dist/app blijft staan.
for (const name of readdirSync(DIST)) {
  if (name !== 'app') rmSync(join(DIST, name), { recursive: true, force: true })
}

const copy = (from, to) => {
  mkdirSync(join(to, '..'), { recursive: true })
  copyFileSync(from, to)
}
// Contact in privacy en voorwaarden (24-10-2026): uit de omgevingsvariabele DEXCRATE_CONTACT (bv. een e-mailadres, als
// variabele in GitHub Actions), zodat er geen persoonlijk adres in de code staat. Leeg = de tekst hieronder.
const CONTACT_DEFAULT = 'ask the person who invited you to the beta'
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
function contactHtml() {
  const c = (process.env.DEXCRATE_CONTACT ?? '').trim()
  if (!c) return CONTACT_DEFAULT
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) ? `<a href="mailto:${escapeHtml(c)}">${escapeHtml(c)}</a>` : escapeHtml(c)
}
// Wachtlijst (25-10-2026, STAP32): het aanmeldformulier roept waitlist_join aan met de publieke Supabase-gegevens (dezelfde
// als die van de app). Uit de omgeving (deploy) of anders .env.local (lokaal). Ontbreekt iets, dan blijft het leeg en
// meldt het formulier dat aanmelden nu niet kan.
function supabasePublic() {
  const local = existsSync('.env.local')
    ? Object.fromEntries(
        readFileSync('.env.local', 'utf8')
          .split(/\r?\n/)
          .map((l) => /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(l))
          .filter(Boolean)
          .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
      )
    : {}
  const url = (process.env.VITE_SUPABASE_URL || local.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
  const key = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY || local.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
  const okUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)
  const okKey = /^[A-Za-z0-9._-]{20,400}$/.test(key)
  if (!okUrl || !okKey) console.warn('Let op: geen geldige VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY; het wachtlijstformulier werkt dan niet.')
  return { url: okUrl ? url : '', key: okKey ? key : '' }
}
const supabase = supabasePublic()
const fillIn = (html) =>
  html.replaceAll('{{CONTACT}}', contactHtml()).replaceAll('{{SUPABASE_URL}}', escapeHtml(supabase.url)).replaceAll('{{SUPABASE_KEY}}', escapeHtml(supabase.key))
for (const name of readdirSync('landing')) {
  const from = join('landing', name)
  if (!statSync(from).isFile()) continue
  if (name.endsWith('.html')) writeFileSync(join(DIST, name), fillIn(readFileSync(from, 'utf8')))
  else copy(from, join(DIST, name))
}
// Screenshots van de app (24-10-2026) en kaartplaatjes voor het verhaal (25-10-2026) op de landingspagina.
for (const dir of ['shots', 'cards']) {
  if (!existsSync(join('landing', dir))) continue
  for (const name of readdirSync(join('landing', dir))) copy(join('landing', dir, name), join(DIST, dir, name))
}
for (const name of ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png']) copy(join('public', name), join(DIST, name))
copy(join('src', 'assets', 'fonts', 'archivo-latin.woff2'), join(DIST, 'fonts', 'archivo-latin.woff2'))
copy(join('src', 'assets', 'fonts', 'OFL.txt'), join(DIST, 'fonts', 'OFL.txt'))

const today = new Date().toISOString().slice(0, 10)
writeFileSync(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}</loc>
    <lastmod>${today}</lastmod>
  </url>
  <url>
    <loc>${SITE}privacy.html</loc>
    <lastmod>${today}</lastmod>
  </url>
  <url>
    <loc>${SITE}terms.html</loc>
    <lastmod>${today}</lastmod>
  </url>
</urlset>
`,
)
console.log(`Landingspagina in ${DIST}/ (${readdirSync(DIST).filter((n) => n !== 'app').join(', ')}), app in ${DIST}/app/`)
