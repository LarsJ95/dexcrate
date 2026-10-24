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
for (const name of readdirSync('landing')) {
  const from = join('landing', name)
  if (!statSync(from).isFile()) continue
  if (name.endsWith('.html')) writeFileSync(join(DIST, name), readFileSync(from, 'utf8').replaceAll('{{CONTACT}}', contactHtml()))
  else copy(from, join(DIST, name))
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
