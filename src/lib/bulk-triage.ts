import {ApiRequestError} from './api'

/**
 * Bulk triage of monitoring groups (errors, metrics) — CYCL-44.
 *
 * The two endpoints are the same shape (`POST .../bulk_triage` with `ids[]` + `bulk_action`) and
 * share the same blind spot, so the guard lives here once instead of in both commands.
 */

/** The three actions the backend accepts, for errors and metrics alike (`Observability::Triage::ACTIONS`). */
export const TRIAGE_ACTIONS = ['resolve', 'ignore', 'reopen'] as const

/**
 * The ids to send: the order they were written in, each one once.
 *
 * The server matches with `where(id: ids)`, which never returns the same row twice — so a repeated
 * `--group` would come back as one row and the check below would read it as "one went missing".
 * Deduplicating is safe here precisely because this endpoint is not all-or-nothing: unlike merge,
 * where the raw list is the evidence the server needs to refuse the whole operation.
 */
export function uniqueIds(values: string[]): string[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = value.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Refuse a partial triage the caller cannot see.
 *
 * `bulk_triage` scopes the selection to the project and answers 200 on whatever is left, so an id
 * belonging to another project (or to a page refreshed on stale data) is dropped without a word.
 * A script would go on believing it closed thirty groups after closing twenty-eight. Everything the
 * server did touch stays done — the triage is reversible, and undoing the good part would be worse
 * — but the command says so and exits non-zero.
 */
export function assertNothingDropped(opts: {
  action: string
  code: string
  noun: string
  requested: string[]
  rows: Array<Record<string, unknown>>
}): void {
  const returned = new Set(opts.rows.map((row) => String(row.id ?? '').toLowerCase()))
  const missing = opts.requested.filter((id) => !returned.has(id.toLowerCase()))
  if (missing.length === 0) return

  throw new ApiRequestError(
    404,
    opts.code,
    `Triaged ${opts.rows.length} of ${opts.requested.length} ${opts.noun}s (${opts.action}). ` +
      `Not found in this project: ${missing.join(', ')} — those were left untouched, ` +
      `the other ${opts.rows.length} were changed.`,
  )
}

/** `1 error group` / `3 error groups` — the count line both commands print. */
export function triagedLine(count: number, noun: string, action: string): string {
  return `Triaged ${count} ${noun}${count === 1 ? '' : 's'} (${action}).`
}
