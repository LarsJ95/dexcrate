// Tekent landing/og-image.png (1200×630, de preview bij delen) met headless Chrome. Opnieuw maken: node tools/og-image.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { openBrowser } from './e2e/browser.mjs'

const font = readFileSync('src/assets/fonts/archivo-latin.woff2').toString('base64')
// Het logo zelf (public/favicon.svg), zonder XML-commentaar.
const logo = readFileSync('public/favicon.svg', 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace('<svg ', '<svg width="88" height="88" ')
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Archivo'; font-weight: 400 900; font-stretch: 62% 125%; src: url(data:font/woff2;base64,${font}) format('woff2'); }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; overflow: hidden; font-family: 'Archivo', sans-serif; color: #f6f3ee;
  background: radial-gradient(120% 70% at 20% -10%, rgb(255 203 5 / 0.22), transparent 70%), radial-gradient(70% 60% at 100% 100%, rgb(176 92 200 / 0.2), transparent 70%), #0e0d12;
  display: grid; grid-template-columns: 1fr 420px; align-items: center; padding: 0 72px; }
.brand { display: flex; align-items: center; gap: 20px; font-size: 64px; font-weight: 900; font-stretch: 118%; }
h1 { margin-top: 36px; font-size: 52px; line-height: 1.08; font-weight: 800; font-stretch: 112%; }
h1 span { color: #ffcb05; }
p { margin-top: 24px; font-size: 26px; color: #d3cfd8; }
.fan { position: relative; height: 420px; }
.card { position: absolute; top: 40px; left: 50%; width: 200px; height: 280px; border-radius: 16px; border: 2px solid rgb(255 255 255 / 0.14); background: linear-gradient(160deg, #2a2933, #17161d); box-shadow: 0 30px 70px rgb(0 0 0 / 0.55); }
.card:nth-child(1) { transform: translateX(-110%) rotate(-12deg); }
.card:nth-child(3) { transform: translateX(10%) rotate(12deg); }
.card:nth-child(2) { transform: translateX(-50%) translateY(-14px); z-index: 1; background: linear-gradient(160deg, rgb(255 203 5 / 0.95), rgb(240 97 47 / 0.9) 55%, rgb(176 92 200 / 0.9)); }
.price { position: absolute; z-index: 2; left: 50%; bottom: 40px; transform: translateX(-50%); background: #17161d; border: 2px solid #2f2e38; border-radius: 999px; padding: 12px 24px; font-size: 26px; font-weight: 800; white-space: nowrap; }
.price span { color: #a19ba9; font-weight: 600; margin-right: 10px; }
</style></head><body>
<div><div class="brand">${logo}Dexcrate</div><h1>Your Pokémon card collection, binder and <span>market value</span></h1><p>Scan cards · Set binders · Cardmarket prices</p></div>
<div class="fan"><div class="card"></div><div class="card"></div><div class="card"></div><div class="price"><span>Market value</span>€ 1,284.50</div></div>
</body></html>`

const page = await openBrowser({ width: 1200, height: 630 })
try {
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false })
  await page.goto(`data:text/html;base64,${Buffer.from(html).toString('base64')}`, 1500)
  const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 } })
  writeFileSync('landing/og-image.png', Buffer.from(shot.data, 'base64'))
  console.log('landing/og-image.png geschreven')
} finally {
  page.close()
}
