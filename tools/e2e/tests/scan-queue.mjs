// Scanlijst in IndexedDB: oude lijst uit localStorage overgezet, in stukken getoond, blijft na herladen; grens van 250.
import assert from 'node:assert/strict'
import { openBrowser, sleep } from '../browser.mjs'

export const name = 'Scanlijst: overzetten naar IndexedDB, in stukken tonen, grens van 250'
export const server = 'dev'

const IDB_COUNT = `new Promise((res) => { const o = indexedDB.open('dexcrate-scan'); o.onsuccess = () => { const db = o.result; if (!db.objectStoreNames.contains('queue')) return res(-1); const r = db.transaction('queue').objectStore('queue').get('current'); r.onsuccess = () => res(r.result ? JSON.parse(r.result).length : 0) } })`
const STATE = `({ rows: document.querySelectorAll('.binder-scan > li').length, more: !!document.querySelector('.catalog-more'), oldKey: localStorage.getItem('dexcrate:scan-queue') !== null })`
const ITEM = `(i) => ({ id: 'q' + i, thumb: 'data:image/jpeg;base64,AAAA', status: 'ready', error: null, rec: { position: 1, namePrinted: 'Pikachu', nameEnglish: 'Pikachu', language: 'en', setCode: 'MEW', cardNumber: String(i + 1), setTotal: '165', variant: null, confidence: 'high', notes: '' }, candidates: [{ key: 'en/sv03.5-' + (i + 1), name: 'Pikachu', localId: String(i + 1), setId: 'sv03.5', setName: '151', image: null, score: 1, reason: 'x' }], chosen: 'en/sv03.5-' + (i + 1), quantity: 1, variant: null, include: true, at: new Date().toISOString() })`

export async function run({ base }) {
  const url = `${base}preview.html?page=scan`
  const page = await openBrowser()
  try {
    // 1. Bestaande gebruiker met een oude lijst van 180 regels in localStorage.
    await page.goto(url, 4000)
    await page.ev(`(() => { const item = ${ITEM}; localStorage.setItem('dexcrate:scan-queue', JSON.stringify(Array.from({ length: 180 }, (_, i) => item(i)))); return 1 })()`)
    await page.reload(5000)
    let s = await page.ev(STATE)
    assert.equal(await page.ev(IDB_COUNT), 180, 'lijst niet overgezet naar IndexedDB')
    assert.equal(s.oldKey, false, 'oude localStorage-sleutel niet opgeruimd')
    assert.ok(s.rows > 0 && s.rows < 180, `niet in stukken getoond (${s.rows} regels)`)
    assert.equal(s.more, true, 'geen "meer laden"-punt')
    for (let i = 0; i < 15; i++) {
      await page.ev('window.scrollTo(0, document.body.scrollHeight); 1')
      await sleep(400)
    }
    s = await page.ev(STATE)
    assert.equal(s.rows, 180, `na scrollen ${s.rows} van 180 regels`)
    await page.reload(5000)
    assert.equal(await page.ev(IDB_COUNT), 180, 'na herladen niet meer 180 regels')

    // 2. Grens: 249 regels, dan twee foto's erbij → 250 en een melding.
    await page.ev(`new Promise((res) => { const item = ${ITEM}; const o = indexedDB.open('dexcrate-scan'); o.onsuccess = () => { const w = o.result.transaction('queue', 'readwrite'); w.objectStore('queue').put(JSON.stringify(Array.from({ length: 249 }, (_, i) => ({ ...item(i), include: false }))), 'current'); w.oncomplete = () => res(1) } })`)
    await page.reload(5000)
    assert.equal(await page.ev(IDB_COUNT), 249)
    const addPhoto = `new Promise((res) => {
      const c = document.createElement('canvas'); c.width = 600; c.height = 840; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 600, 840)
      c.toBlob((b) => {
        const dt = new DataTransfer(); dt.items.add(new File([b], 'kaart.jpg', { type: 'image/jpeg' }))
        const input = document.querySelector('input[type=file]'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }))
        setTimeout(() => res(document.querySelector('.queue-error')?.textContent ?? null), 2500)
      }, 'image/jpeg', 0.8)
    })`
    assert.equal(await page.ev(addPhoto), null, 'foto 250 gaf een foutmelding')
    await sleep(1000)
    assert.equal(await page.ev(IDB_COUNT), 250)
    assert.ok(await page.ev(addPhoto), 'foto 251 gaf geen melding')
    await sleep(1000)
    assert.equal(await page.ev(IDB_COUNT), 250, 'meer dan 250 regels bewaard')
  } finally {
    page.close()
  }
}
