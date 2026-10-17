// Foutlogboek: fouten gaan naar app_errors, één keer per melding; netwerkfouten niet.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { openBrowser, sleep, supabaseAnswer, supabaseRef } from '../browser.mjs'

export const name = 'Foutlogboek: fouten gelogd, dubbele en netwerkfouten niet'
export const server = 'build'

export async function run({ base }) {
  const ref = supabaseRef()
  const cards = readFileSync('tools/e2e/fixtures/cards.json', 'utf8')
  const logged = []
  const page = await openBrowser()
  try {
    await page.mockSupabase(ref, (req) => {
      if (req.url.includes('/rest/v1/app_errors')) {
        logged.push(JSON.parse(req.postData ?? '{}'))
        return { status: 201, body: '' }
      }
      return supabaseAnswer(req, { cards })
    })
    await page.goto(base, 1500)
    await page.signIn(ref)
    await page.goto(`${base}#/collection`, 500)
    await page.reload(3500)
    await page.ev(
      `setTimeout(() => { throw new Error('Testfout uit e2e') }); setTimeout(() => { throw new Error('Testfout uit e2e') }, 10); Promise.reject(new Error('Afgewezen belofte')); Promise.reject(new TypeError('Failed to fetch')); 1`,
    )
    await sleep(2500)
    const messages = logged.map((r) => r.message).sort()
    assert.deepEqual(messages, ['Error: Afgewezen belofte', 'Error: Testfout uit e2e'])
    for (const r of logged) {
      assert.ok(r.app_build, 'build ontbreekt')
      assert.ok(r.user_agent, 'user agent ontbreekt')
    }
  } finally {
    page.close()
  }
}
