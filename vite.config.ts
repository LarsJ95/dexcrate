/// <reference types="vitest/config" />
import { existsSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Testomgeving (`--mode staging`) alleen met een eigen .env.staging.local die naar een ánder project wijst.
 * Vite laadt .env.local (productie) in elke modus; zonder deze controle werk je ongemerkt op je echte data.
 */
function stagingGuard(): Plugin {
  return {
    name: 'dexcrate-staging-guard',
    config(_, { mode }) {
      if (mode !== 'staging') return
      const url = loadEnv('staging', process.cwd(), 'VITE_').VITE_SUPABASE_URL
      const prodUrl = loadEnv('production', process.cwd(), 'VITE_').VITE_SUPABASE_URL
      if (!existsSync('.env.staging.local') || !url || url === prodUrl) {
        throw new Error('Testomgeving: zet de URL en publishable key van het TESTproject in .env.staging.local (zie .env.example).')
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Relatieve paden: werkt op elke host/submap dankzij hash-routing.
  base: './',
  // Sinds 17-10-2026 staat de app op dexcrate.com/app/; de hoofdmap is de landingspagina (landing/, tools/build-landing.mjs).
  build: { outDir: 'dist/app' },
  // Bouwmoment, als versie-aanduiding in Settings.
  define: { __APP_BUILD__: JSON.stringify(new Date().toISOString()) },
  test: {
    // Getransformeerde modules bewaren tussen testruns (sneller opstarten).
    fsModuleCache: true,
    // Tests zoals in CI: zonder Supabase-sleutels, ook als .env.local lokaal bestaat.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
  },
  plugins: [
    stagingGuard(),
    react(),
    VitePWA({
      // 'prompt': de app bepaalt zelf wanneer een nieuwe versie laadt (src/lib/appUpdate.ts).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Dexcrate',
        short_name: 'Dexcrate',
        description: 'Pokémon card collection, sales and market value',
        lang: 'en',
        theme_color: '#f6f1e7',
        background_color: '#f6f1e7',
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
              url.origin === 'https://tcgplayer-cdn.tcgplayer.com' ||
              // Chinese catalogus (src/lib/chsCatalog.ts): foto's per vaste versie, en de verkleinde versies.
              (url.origin === 'https://cdn.jsdelivr.net' && url.pathname.startsWith('/gh/duanxr/PTCG-CHS-Datasets@')) ||
              url.origin === 'https://wsrv.nl',
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
