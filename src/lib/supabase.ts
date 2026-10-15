import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url: string | undefined = import.meta.env.VITE_SUPABASE_URL
const key: string | undefined = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('VITE_SUPABASE_URL en VITE_SUPABASE_PUBLISHABLE_KEY ontbreken (zie .env.example).')
}

export const supabase: SupabaseClient = createClient(url, key)
