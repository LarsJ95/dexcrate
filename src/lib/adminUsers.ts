import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * Accounts beheren via de Edge Function admin-users (uitnodigen, blokkeren, verwijderen). De functie controleert zelf
 * of je beheerder is en gebruikt de serversleutel; die komt nooit in de app.
 */

export const ADMIN_USERS_MISSING = 'Account actions are not set up yet: deploy the admin-users function in Supabase (see TODO.md).'

async function invoke(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    const ctx: unknown = error instanceof FunctionsHttpError ? error.context : null
    if (ctx instanceof Response) {
      if (ctx.status === 404) throw new Error(ADMIN_USERS_MISSING)
      const res: unknown = await ctx.json().catch(() => null)
      const msg = typeof res === 'object' && res !== null ? (res as { error?: unknown }).error : null
      if (typeof msg === 'string') throw new Error(msg)
    }
    throw new Error('The admin-users function is unavailable. Is it deployed?')
  }
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
}

export async function inviteUser(email: string): Promise<void> {
  await invoke({ action: 'invite', email: email.trim() })
}

export async function setBlocked(userId: string, blocked: boolean, reason: string): Promise<void> {
  await invoke({ action: blocked ? 'ban' : 'unban', userId, reason: reason.trim() })
}

/** Account en al zijn gegevens en bestanden weg; `confirmEmail` moet het e-mailadres van het account zijn. Geeft het aantal verwijderde bestanden. */
export async function deleteUser(userId: string, confirmEmail: string, reason: string): Promise<number> {
  const r = await invoke({ action: 'delete', userId, confirmEmail: confirmEmail.trim(), reason: reason.trim() })
  return typeof r.filesRemoved === 'number' ? r.filesRemoved : 0
}

/** Staat de functie er en heeft hij een serversleutel? */
export async function adminUsersHealth(): Promise<'legacy' | 'secret' | 'missing'> {
  const r = await invoke({ action: 'health' })
  return r.serverKey === 'legacy' || r.serverKey === 'secret' ? r.serverKey : 'missing'
}
