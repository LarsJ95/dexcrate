import { supabase } from './supabase'

/** Mededeling van de beheerder aan alle gebruikers (STAP22, tabel announcements; alleen de actieve is leesbaar). */
export interface Announcement {
  id: string
  message: string
  level: 'info' | 'warning'
}

const DISMISSED_KEY = 'dexcrate:announcement-dismissed'

/** De actieve mededeling, of null (ook zonder STAP22 of bij een fout: dan niets tonen). */
export async function getAnnouncement(): Promise<Announcement | null> {
  const { data, error } = await supabase.from('announcements').select('id, message, level').eq('active', true).order('created_at', { ascending: false }).limit(1)
  if (error) {
    if (error.code !== 'PGRST205' && error.code !== '42P01') console.warn('Mededeling ophalen mislukt', error)
    return null
  }
  const row: unknown = Array.isArray(data) ? data[0] : null
  if (typeof row !== 'object' || row === null) return null
  const r = row as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.message !== 'string') return null
  return { id: r.id, message: r.message, level: r.level === 'warning' ? 'warning' : 'info' }
}

/** Weggeklikt op dit apparaat (alleen deze mededeling; een nieuwe verschijnt weer). */
export function isDismissed(id: string): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === id
  } catch {
    return false
  }
}

export function dismiss(id: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, id)
  } catch (err) {
    console.warn('Mededeling wegklikken bewaren mislukt', err)
  }
}
