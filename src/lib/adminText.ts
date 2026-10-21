import type { AdminAction } from './admin'

/** Teksten voor de beheerpagina (#/admin). */

/** Datum en tijd kort (en-GB, zoals de rest van de app). */
export const when = (iso: string | null): string => {
  if (!iso) return 'never'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '–' : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

export const plural = (n: number, one: string, many: string): string => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`

export const LEDGER_LABELS: Record<string, string> = {
  card: 'Card added',
  cardkey: 'Card added',
  sale: 'Sale',
  purchase: 'Purchase',
  dex: 'New Pokédex entry',
  set: 'Set complete',
  daily: 'Daily bonus',
  pack: 'Pack opened',
  trade: 'Traded in',
  wish: 'Wish',
  crateset: 'Crate set complete',
  craft: 'Card bought',
  admin: 'By admin',
}

/** Logregel als korte tekst. */
export function actionText(a: AdminAction): string {
  const who = a.targetEmail ?? (typeof a.details?.email === 'string' ? a.details.email : null) ?? ''
  switch (a.action) {
    case 'grant_points':
      return `${a.points !== null && a.points > 0 ? '+' : ''}${a.points?.toLocaleString('en-GB') ?? '–'} pts · ${who || '(deleted user)'}`
    case 'set_rules':
      return 'Crate rules changed'
    case 'set_scan_limit': {
      const d = a.details ?? {}
      const lim = d.per_minute === null && d.per_day === null ? 'default' : `${String(d.per_minute ?? '40')}/min, ${String(d.per_day ?? '500')}/day`
      return `Scan limit ${lim} · ${who}`
    }
    case 'announce':
      return 'Announcement'
    case 'invite':
      return `Invited ${who}`
    case 'ban':
      return `Blocked ${who}`
    case 'unban':
      return `Unblocked ${who}`
    case 'delete_user':
      return `Deleted ${who || 'a user'}`
    default:
      return a.action
  }
}

