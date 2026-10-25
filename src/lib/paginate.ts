import type {CliApi} from './api'

/**
 * Read every page of a paginated collection endpoint and return the aggregated rows.
 *
 * Bounded collections (secrets, secret assets) must be listed in full, not just page 1 — reading
 * only `res.data` silently truncated to the backend page size (CYCL: `cyi secrets list` showed 10).
 * A backend that does not paginate returns everything on page 1 (`meta` absent) → single fetch.
 */
export async function fetchAllPages<T = Record<string, unknown>>(
  api: CliApi,
  basePath: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const all: T[] = []
  let page = 1
  let totalPages = 1
  do {
    const qs = new URLSearchParams({...params, page: String(page), per: '100'}).toString()
    // eslint-disable-next-line no-await-in-loop
    const res = await api.get<T[]>(`${basePath}?${qs}`)
    all.push(...(Array.isArray(res.data) ? res.data : []))
    totalPages = Number(res.meta?.total_pages ?? 1)
    page += 1
  } while (page <= totalPages)

  return all
}

/**
 * Meta for a fully-aggregated collection. `fetchAllPages` collapses every backend page into a
 * single logical page, so page-1's meta (e.g. `total_pages: 2`) would misdescribe the payload —
 * and dropping `meta` altogether breaks `--json` consumers of the envelope. This restates the
 * backend's `{page, per, total, total_pages}` contract consistently with the aggregated `data`.
 */
export function aggregatedMeta(count: number): {page: number; per: number; total: number; total_pages: number} {
  return {page: 1, per: count, total: count, total_pages: 1}
}
