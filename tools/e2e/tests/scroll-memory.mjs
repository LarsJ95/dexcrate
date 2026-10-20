// Terug naar Collection (bv. na een set): zelfde plek in de lijst, ook als die verder dan de eerste 48 kaarten was.
import assert from 'node:assert/strict'
import { openBrowser, sleep, supabaseAnswer, supabaseRef } from '../browser.mjs'

export const name = 'Collection: terug na een set op dezelfde plek in de lijst'
export const server = 'build'

/** 120 losse kaarten (niet gekoppeld: geen catalogusverzoeken nodig). */
const cards = JSON.stringify(
  Array.from({ length: 120 }, (_, i) => ({
    id: `c${i}`,
    name: `Card ${i + 1}`,
    set_code: 'TST',
    card_number: String(i + 1),
    tcgdex_id: null,
    status: 'collection',
    sort_order: i,
    quantity: 1,
    language: 'en',
  })),
)

export async function run({ base }) {
  const ref = supabaseRef()
  const page = await openBrowser()
  try {
    await page.mockSupabase(ref, (req) => supabaseAnswer(req, { cards }))
    await page.goto(base, 1500)
    await page.signIn(ref)
    await page.reload()
    await page.goto(`${base}#/collection`, 3500)

    // Ver naar beneden: de volgende reeks kaarten laadt erbij.
    for (const y of [4000, 7000, 9000]) {
      await page.ev(`(window.scrollTo(0, ${y}), 1)`)
      await sleep(700)
    }
    const before = await page.ev(`({ y: Math.round(window.scrollY), tiles: document.querySelectorAll('.binder > li').length })`)
    assert.ok(before.tiles > 48, `niet meer dan de eerste 48 kaarten geladen (${before.tiles})`)
    assert.ok(before.y > 5000, `niet ver genoeg gescrold (${before.y})`)

    // Naar een andere pagina (zoals "Open set" in een kaart) en met terug weer naar Collection.
    await page.ev(`(location.hash = '#/sets', 1)`)
    await sleep(2500)
    assert.equal(await page.ev(`location.hash`), '#/sets')
    await page.ev(`(history.back(), 1)`)
    await sleep(3500)

    const after = await page.ev(`({ hash: location.hash, y: Math.round(window.scrollY), tiles: document.querySelectorAll('.binder > li').length })`)
    assert.equal(after.hash, '#/collection')
    assert.ok(after.tiles >= before.tiles, `minder kaarten geladen dan voor vertrek (${after.tiles} < ${before.tiles})`)
    assert.ok(Math.abs(after.y - before.y) <= 10, `scrollpositie niet terug: ${after.y} i.p.v. ${before.y}`)
  } finally {
    page.close()
  }
}
