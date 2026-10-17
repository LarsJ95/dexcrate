import { describe, expect, it } from 'vitest'

describe('testomgeving', () => {
  it('draait zonder Supabase-sleutels, net als CI (vite.config.ts test.env)', async () => {
    expect(import.meta.env.VITE_SUPABASE_URL).toBeFalsy()
    expect(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY).toBeFalsy()
    await expect(import('./supabase')).rejects.toThrow(/VITE_SUPABASE_URL/)
  })
})
