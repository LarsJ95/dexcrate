// Browsertests (headless Chrome, geen extra dependency). Supabase wordt in de browser nagebootst: er gaat niets naar je echte database.
//
// Gebruik (vanuit app/):
//   npm run build
//   node tools/e2e/run.mjs [naam ...]        bv. node tools/e2e/run.mjs scan-queue
//
// Nodig: .env.local met VITE_SUPABASE_URL (alleen om het adres te herkennen) en Chrome
// (CHROME_PATH, anders de Playwright-headless-shell in AppData, zoals tools/lighthouse.mjs).
// "build"-tests draaien op `vite preview` (service worker, offline); "dev"-tests op `vite` (preview.html).
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { sleep } from './browser.mjs'

// Let op: sommige poorten (bv. 4190) blokkeren browsers en fetch ("bad port").
const PORTS = { build: 4183, dev: 4184 }
const wanted = process.argv.slice(2)
const files = readdirSync(join('tools', 'e2e', 'tests'))
  .filter((f) => f.endsWith('.mjs'))
  .filter((f) => wanted.length === 0 || wanted.includes(f.replace(/\.mjs$/, '')))
if (files.length === 0) throw new Error(`Geen tests gevonden voor: ${wanted.join(', ')}`)
// De app staat sinds 17-10-2026 in dist/app; `vite preview` serveert die map als hoofdmap.
if (!existsSync('dist/app/index.html')) throw new Error('Geen build: draai eerst npm run build.')

const tests = await Promise.all(files.map(async (f) => ({ file: f, ...(await import(pathToFileURL(join('tools', 'e2e', 'tests', f)).href)) })))
const VITE = join('node_modules', 'vite', 'bin', 'vite.js')
const servers = []

async function startServer(kind) {
  // Vast op 127.0.0.1: "localhost" kan bij Vite alleen IPv6 (::1) zijn, en dan haalt Node hem niet.
  const args = [VITE, ...(kind === 'build' ? ['preview'] : []), '--host', '127.0.0.1', '--port', String(PORTS[kind]), '--strictPort']
  // Rechtstreeks via Node (geen shell): dan stopt kill() ook echt de server.
  servers.push(spawn(process.execPath, args, { stdio: 'ignore' }))
  const base = `http://127.0.0.1:${PORTS[kind]}/`
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) return base
    } catch {
      // Server start nog.
    }
    await sleep(250)
  }
  throw new Error(`Server (${kind}) start niet op ${base}.`)
}

let failed = 0
try {
  const bases = {}
  for (const kind of new Set(tests.map((t) => t.server))) bases[kind] = await startServer(kind)
  for (const t of tests) {
    const start = Date.now()
    try {
      await t.run({ base: bases[t.server] })
      console.log(`✓ ${t.name} (${((Date.now() - start) / 1000).toFixed(1)} s)`)
    } catch (e) {
      failed++
      console.log(`✗ ${t.name}\n    ${e instanceof Error ? e.message : String(e)}`)
    }
  }
} finally {
  for (const s of servers) s.kill()
}
console.log(failed === 0 ? `\nAlle ${tests.length} browsertests geslaagd.` : `\n${failed} van ${tests.length} browsertests mislukt.`)
process.exitCode = failed === 0 ? 0 : 1
