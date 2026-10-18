// Maakt alle app-icoontjes uit public/favicon.svg met headless Chrome. Opnieuw maken: node tools/icons.mjs
// - favicon.ico (16/32/48, PNG-in-ICO) voor tabbladen en zoekmachines
// - apple-touch-icon.png (180, vol vlak; iOS rondt zelf af)
// - pwa-192x192.png / pwa-512x512.png (afgeronde tegel, purpose "any")
// - maskable-512x512.png (vol vlak, logo binnen de veilige zone; Android-beginscherm)
import { readFileSync, writeFileSync } from 'node:fs'
import { openBrowser } from './e2e/browser.mjs'

const BG = '#0e0d12'
const svg = readFileSync('public/favicon.svg', 'utf8')
const src = `data:image/svg+xml,${encodeURIComponent(svg)}`

/** size = canvas, logo = deel van de breedte voor het logo, tile = 'none' | 'square' | 'rounded'. */
const html = (size, logo, tile) => {
  const bg = tile === 'none' ? 'transparent' : BG
  const radius = tile === 'rounded' ? `${Math.round(size * 0.22)}px` : '0'
  const px = Math.round(size * logo)
  return `<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg};border-radius:${radius}"><img src="${src}" width="${px}" height="${px}" style="display:block"></div></body></html>`
}

const page = await openBrowser({ width: 600, height: 600 })
const render = async (size, logo, tile) => {
  await page.goto(`data:text/html,${encodeURIComponent(html(size, logo, tile))}`, 400)
  const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } })
  return Buffer.from(shot.data, 'base64')
}

const icoParts = []
try {
  await page.send('Emulation.setDeviceMetricsOverride', { width: 600, height: 600, deviceScaleFactor: 1, mobile: false })
  await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
  for (const size of [16, 32, 48]) icoParts.push({ size, buf: await render(size, 1, 'none') })
  writeFileSync('public/apple-touch-icon.png', await render(180, 0.72, 'square'))
  writeFileSync('public/pwa-192x192.png', await render(192, 0.72, 'rounded'))
  writeFileSync('public/pwa-512x512.png', await render(512, 0.72, 'rounded'))
  // Veilige zone van een maskable icoon: cirkel van 80% van de breedte.
  writeFileSync('public/maskable-512x512.png', await render(512, 0.58, 'square'))
} finally {
  page.close()
}

// ICO: header (6 bytes) + per beeld een entry (16 bytes) + de PNG-data.
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(icoParts.length, 4)
let offset = 6 + 16 * icoParts.length
const entries = icoParts.map(({ size, buf }) => {
  const e = Buffer.alloc(16)
  e.writeUInt8(size, 0)
  e.writeUInt8(size, 1)
  e.writeUInt16LE(1, 4)
  e.writeUInt16LE(32, 6)
  e.writeUInt32LE(buf.length, 8)
  e.writeUInt32LE(offset, 12)
  offset += buf.length
  return e
})
writeFileSync('public/favicon.ico', Buffer.concat([header, ...entries, ...icoParts.map((p) => p.buf)]))
console.log('Icoontjes geschreven in public/: favicon.ico, apple-touch-icon.png, pwa-192x192.png, pwa-512x512.png, maskable-512x512.png')
