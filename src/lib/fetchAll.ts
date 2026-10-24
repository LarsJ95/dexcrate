/**
 * Lijsten in delen ophalen. De API geeft hoogstens max_rows rijen per verzoek (Supabase: standaard 1000), ook als je
 * om meer vraagt; wat erboven zit valt anders stil weg.
 */

/** Rijen per verzoek. Niet groter dan max_rows van het project, anders stopt het ophalen al na de eerste pagina. */
export const PAGE_SIZE = 1000

export interface PageError {
  message: string
  code?: string
}

/** Eén pagina: de query met `.range(from, to)` erachter, elke keer nieuw gebouwd (dezelfde query twee keer afwachten voert hem twee keer uit). */
export type PageQuery<T> = (from: number, to: number) => PromiseLike<{ data: NoInfer<T>[] | null; error: PageError | null }>

/**
 * Alle rijen, pagina voor pagina tot er een niet-volle pagina komt. De query moet eindigen op een unieke kolom
 * (bv. `.order('id')`), anders kunnen rijen tussen pagina's dubbel komen of wegvallen. Verandert er tussen twee
 * pagina's iets (ander tabblad of apparaat), dan kan een rij tot de volgende keer laden dubbel of weg zijn.
 * Fout op een pagina = fout voor het geheel, nooit een halve lijst. `max`: bewust hoogstens zoveel rijen.
 */
export async function fetchAllPages<T = unknown>(page: PageQuery<T>, opts: { max?: number } = {}): Promise<{ data: T[]; error: null } | { data: null; error: PageError }> {
  const max = opts.max ?? Infinity
  const out: T[] = []
  for (let from = 0; from < max; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, max) - 1
    const { data, error } = await page(from, to)
    if (error) return { data: null, error }
    if (!Array.isArray(data)) return { data: null, error: { message: 'Unexpected response from the database.' } }
    out.push(...data)
    if (data.length < to - from + 1) break
  }
  return { data: out, error: null }
}
