// Tekent landing/og-image.png (1200×630, de preview bij delen) met headless Chrome. Opnieuw maken: node tools/og-image.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { openBrowser } from './e2e/browser.mjs'

const font = readFileSync('src/assets/fonts/archivo-latin.woff2').toString('base64')
// Het logo zelf (public/favicon.svg), zonder XML-commentaar.
const logo = readFileSync('public/favicon.svg', 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace('<svg ', '<svg width="72" height="72" ')
// Zelfde gevoel als de landingspagina (24-10-2026): crème met bliksempatroon, witte panelen met energierand, gele markering.
const bolt = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='-6 -6 36 36'%3E%3Cpath d='M13 2 4 14h6l-1 8 9-12h-6l1-8z'/%3E%3C/svg%3E\") 0 0 / 56px 56px"
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Archivo'; font-weight: 400 900; font-stretch: 62% 125%; src: url(data:font/woff2;base64,${font}) format('woff2'); }
* { box-sizing: border-box; margin: 0; }
body { position: relative; width: 1200px; height: 630px; overflow: hidden; font-family: 'Archivo', sans-serif; color: #1f1a24; background: #f6f1e7;
  display: grid; grid-template-columns: 1fr 440px; gap: 56px; align-items: center; padding: 0 72px; }
body::before { content: ''; position: absolute; inset: 0; z-index: -1; background: #f5c518; opacity: 0.1; -webkit-mask: ${bolt}; mask: ${bolt}; }
.brand { display: flex; align-items: center; gap: 18px; font-size: 52px; font-weight: 900; font-stretch: 118%; }
h1 { margin-top: 34px; font-size: 58px; line-height: 1.06; font-weight: 800; font-stretch: 118%; letter-spacing: -0.01em; }
h1 span { background: linear-gradient(transparent 62%, rgb(255 203 5 / 0.75) 62%); }
p { margin-top: 26px; font-size: 26px; font-weight: 600; color: #3b3443; }
.demo { position: relative; display: grid; gap: 18px; }
.panel { background: #fff; border: 1px solid #e6dccb; border-top: 7px solid #f0612f; border-radius: 24px; padding: 22px 26px; box-shadow: 0 10px 28px rgb(90 60 20 / 0.12); }
.label { color: #5f5566; font-weight: 600; font-size: 20px; }
.value strong { display: block; font-size: 58px; font-stretch: 118%; line-height: 1.1; }
.up { color: #17803d; font-weight: 700; font-size: 20px; }
.binder { position: relative; border-top-color: #3d8fe0; }
.head { display: flex; justify-content: space-between; font-weight: 700; font-size: 22px; }
.head span { color: #5f5566; font-weight: 600; }
.meter { height: 12px; margin: 12px 0 16px; border-radius: 999px; background: #efe7d8; overflow: hidden; }
.meter i { display: block; width: 74%; height: 100%; background: #17803d; }
.slots { display: grid; grid-template-columns: repeat(6, 1fr); gap: 9px; }
.slot { aspect-ratio: 63 / 88; border-radius: 8px; background: linear-gradient(150deg, #f0612f, #f5c518 45%, #b05cc8); }
.slot:nth-child(3n + 2) { background: linear-gradient(150deg, #3d8fe0, #93c5fd 50%, #4fb84a); }
.slot:nth-child(4n + 3) { background: linear-gradient(150deg, #b05cc8, #e47fb8 55%, #f5c518); }
.slot.missing { background: #fbf8f2; border: 2px dashed #cdbfa7; }
.new { position: absolute; top: -14px; right: 18px; padding: 5px 14px; border-radius: 999px; background: #ffcb05; color: #1a1300; font-weight: 800; font-size: 18px; rotate: 6deg; box-shadow: 0 8px 20px rgb(23 22 28 / 0.18); }
</style></head><body>
<div><div class="brand">${logo}Dexcrate</div><h1>Your Pokémon cards, <span>finally all in one place.</span></h1><p>Scan cards · Set binders · Prices in euros</p></div>
<div class="demo">
<div class="panel value"><span class="label">Your collection is worth</span><strong>€1,284.50</strong><span class="up">↑ +6% this month</span></div>
<div class="panel binder"><span class="new">NEW!</span><div class="head">Surging Sparks <span>142 / 191</span></div><div class="meter"><i></i></div>
<div class="slots"><i class="slot"></i><i class="slot"></i><i class="slot missing"></i><i class="slot"></i><i class="slot"></i><i class="slot"></i><i class="slot"></i><i class="slot missing"></i><i class="slot"></i><i class="slot"></i><i class="slot missing"></i><i class="slot"></i></div></div>
</div>
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
