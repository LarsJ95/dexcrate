// Collectie en wishlist offline uit de cache (IndexedDB), en de cache weg na uitloggen.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { openBrowser, sleep, supabaseAnswer, supabaseRef } from '../browser.mjs'

export const name = 'Offline: collectie en wishlist uit de cache, gewist na uitloggen'
export const server = 'build'

export async function run({ base }) {
  const ref = supabaseRef()
  const cards = readFileSync('tools/e2e/fixtures/cards.json', 'utf8')
  const wish = readFileSync('tools/e2e/fixtures/wish.json', 'utf8')
  let offline = false
  const page = await openBrowser()
  try {
    await page.mockSupabase(ref, (req) => (offline ? 'fail' : supabaseAnswer(req, { cards, wishlist_items: wish })))
    const state = () =>
      page.ev(`({ notice: !!document.querySelector('.offline-notice'), cards: document.querySelectorAll('.binder > li').length, wishes: document.querySelectorAll('.wish-item').length })`)
    const cacheKeys = () =>
      page.ev(`new Promise((res) => { const o = indexedDB.open('dexcrate-cache'); o.onsuccess = () => { const db = o.result; if (!db.objectStoreNames.contains('data')) return res([]); const r = db.transaction('data').objectStore('data').getAllKeys(); r.onsuccess = () => res(r.result.map(String)) }; o.onerror = () => res([]) })`)

    await page.goto(base, 1500)
    await page.signIn(ref)
    await page.reload()
    await page.goto(`${base}#/collection`, 3500)
    const onlineCards = (await state()).cards
    await page.goto(`${base}#/wishlist`, 3500)
    const onlineWishes = (await state()).wishes
    assert.ok(onlineCards > 0, 'online: geen kaarten in de collectie')
    assert.ok(onlineWishes > 0, 'online: geen wensen')
    assert.ok((await cacheKeys()).length >= 2, 'online: cache niet gevuld')

    offline = true
    await page.offline(true)
    for (const [route, key, expected] of [['collection', 'cards', onlineCards], ['wishlist', 'wishes', onlineWishes]]) {
      await page.goto('about:blank', 300)
      await page.goto(`${base}#/${route}`, 4500)
      const s = await state()
      assert.equal(s.notice, true, `offline ${route}: geen offline-melding`)
      assert.equal(s[key], expected, `offline ${route}: ${s[key]} in plaats van ${expected}`)
    }

    offline = false
    await page.offline(false)
    await page.goto('about:blank', 300)
    await page.goto(`${base}#/collection`, 4000)
    await page.ev(`(document.querySelector('[aria-label="Sign out"]')?.click(), 1)`)
    await sleep(2500)
    assert.deepEqual(await cacheKeys(), [], 'na uitloggen staat er nog data in de cache')
    assert.equal(await page.ev(`!!document.querySelector('input[type=password]')`), true, 'na uitloggen geen inlogscherm')
  } finally {
    page.close()
  }
}
