// Opruimen (17-10-2026): tot dan stond de app op de hoofdmap van dexcrate.com, met een service worker voor "/".
// Sinds de app op /app/ staat, vervangt dit bestand die oude service worker: het verwijdert zijn eigen precache
// (niet die van /app/), schrijft zich uit en laadt open tabbladen opnieuw, zodat de landingspagina verschijnt.
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const scope = self.registration.scope
      for (const key of await caches.keys()) {
        if (key.includes('precache') && key.endsWith(scope)) await caches.delete(key)
      }
      await self.registration.unregister()
      for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url)
    })(),
  )
})
