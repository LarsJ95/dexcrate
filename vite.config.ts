import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Relatieve paden: werkt op elke host/submap (bv. GitHub Pages /<repo>/) dankzij hash-routing.
  base: './',
  // Bouwmoment, als versie-aanduiding in Settings.
  define: { __APP_BUILD__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    react(),
    VitePWA({
      // 'prompt': de app bepaalt zelf wanneer een nieuwe versie laadt (src/lib/appUpdate.ts).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Dexcrate',
        short_name: 'Dexcrate',
        description: 'Pokémon card collection, sales and market value',
        lang: 'en',
        theme_color: '#0e0d12',
        background_color: '#0e0d12',
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
        // Zelf gehoste fonts meenemen, zodat de app offline in de juiste letter laadt.
        globPatterns: ['**/*.{js,css,html,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Kaartplaatjes veranderen niet: lang bewaren, snel en offline beschikbaar.
            urlPattern: ({ url }) =>
              url.origin === 'https://assets.tcgdex.net' ||
              url.origin === 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com' ||
              url.origin === 'https://tcgplayer-cdn.tcgplayer.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'tcgdex-images',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Supabase (je eigen data) en TCGdex-API worden bewust niet door de service worker gecachet.
        ],
      },
    }),
  ],
})
