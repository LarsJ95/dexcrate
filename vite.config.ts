import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Relatieve paden: werkt op elke host/submap (bv. GitHub Pages /<repo>/) dankzij hash-routing.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Kaartenmap',
        short_name: 'Kaartenmap',
        description: 'Pokémon-kaarten: collectie, verkoop en marktwaarde',
        lang: 'nl',
        theme_color: '#0a1226',
        background_color: '#0a1226',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // exceljs-chunk (~1 MB) alleen laden wanneer nodig, niet vooraf cachen.
        globIgnores: ['**/exceljs*.js'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Kaartplaatjes veranderen niet: lang bewaren, snel en offline beschikbaar.
            urlPattern: ({ url }) => url.origin === 'https://assets.tcgdex.net',
            handler: 'CacheFirst',
            options: {
              cacheName: 'tcgdex-images',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          // Supabase (je eigen data) en TCGdex-API worden bewust niet door de service worker gecachet.
        ],
      },
    }),
  ],
})
