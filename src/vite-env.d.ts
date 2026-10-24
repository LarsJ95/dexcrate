/// <reference types="vite-plugin-pwa/vanillajs" />

/** Moment van bouwen (ISO), gezet in vite.config.ts. */
declare const __APP_BUILD__: string

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** "true" = registreren staat open (anders alleen op uitnodiging). */
  readonly VITE_SIGNUP_OPEN?: string
}
