// Melding "N cards not linked yet": wegklikken, blijft weg na herladen.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { openBrowser, supabaseAnswer, supabaseRef } from '../browser.mjs'

export const name = 'Melding niet-gekoppelde kaarten: wegklikken blijft weg na herladen'
export const server = 'build'

export async function run({ base }) {
  const ref = supabaseRef()
  const cards = readFileSync('tools/e2e/fixtures/cards.json', 'utf8')
  const page = await openBrowser()
  try {
    await page.mockSupabase(ref, (req) => supabaseAnswer(req, { cards }))
    const notice = () => page.ev(`!!document.querySelector('.notice-dismissable')`)

    await page.goto(base, 1500)
    await page.signIn(ref)
    await page.reload()
    await page.goto(`${base}#/collection`, 3500)
    assert.equal(await notice(), true, 'melding niet zichtbaar')

    await page.ev(`(document.querySelector('.notice-dismiss').click(), 1)`)
    await page.goto('about:blank', 300)
    await page.goto(`${base}#/collection`, 3500)
    assert.equal(await notice(), false, 'melding na wegklikken en herladen weer zichtbaar')
  } finally {
    page.close()
  }
}
