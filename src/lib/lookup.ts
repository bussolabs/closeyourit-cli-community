import {ApiRequestError, type CliApi} from './api'
import {ErrorCodes} from '../errors/error-codes'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolution of a readable reference (project key, group name) into its id.
 *
 * It lives here and no longer inside `BaseCommand` because it is no longer command-only stuff: the
 * MCP server (CYCL-56) accepts the same references the command line accepts, and a second copy of
 * this lookup would mean two behaviours that diverge at the first change.
 */

/**
 * Resolve a project reference (UUID passes through; otherwise matched by key, case-insensitive).
 * Walks every page of `/cli/v1/projects`: a key can live past the first page, so a single-page
 * lookup would 404 keys like legalbloom LBRA/LBWB while their UUID (and first-page keys) worked (CYCL-1).
 */
export async function resolveProjectId(api: CliApi, value: string): Promise<string> {
  if (UUID_RE.test(value)) return value
  let page = 1
  let totalPages = 1
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await api.get<Array<{id: string; key?: string}>>(`/cli/v1/projects?page=${page}&per=100`)
    const match = (res.data ?? []).find((project) => (project.key ?? '').toLowerCase() === value.toLowerCase())
    if (match) return match.id
    totalPages = Number(res.meta?.total_pages ?? 1)
    page += 1
  } while (page <= totalPages)
  throw new ApiRequestError(404, ErrorCodes.Project.notFound, `Project not found: ${value}`)
}

/** Resolve an `{id, name}` reference by name (UUID passes through). */
export async function resolveNamedId(
  api: CliApi,
  path: string,
  value: string,
  code: string,
  label: string,
): Promise<string> {
  if (UUID_RE.test(value)) return value
  const noun = label.toLowerCase()
  const rows = await fetchLookupRows<{id: string; name?: string}>(
    api,
    path,
    `Listing the ${noun}s needs the permissions.manage permission — pass the ${noun} id instead of its name.`,
  )
  const match = rows.find((row) => (row.name ?? '').toLowerCase() === value.toLowerCase())
  if (!match) {
    throw new ApiRequestError(404, code, `${label} not found: ${value}`)
  }

  return match.id
}

/**
 * Every row of an organization lookup (teams, roles, groups, members) — all its pages.
 *
 * The server serves ten per page: stopping at the first made the eleventh team or the eleventh
 * person invisible, and a perfectly good name or email came back as "not found" (CYCL-42, the
 * lesson `resolveProjectId` already learned on project keys in CYCL-1).
 *
 * A 403 here is not about the command being run: listing teams needs `permissions.manage` and
 * listing members `members.view`, permissions that a team workload board never asks for. Left
 * alone it would read as "Permesso negato" on an operation the caller is entitled to, so the
 * refusal carries the way out instead — name the id, skip the lookup.
 */
export async function fetchLookupRows<T>(api: CliApi, path: string, hint: string): Promise<T[]> {
  const rows: T[] = []
  let page = 1
  let totalPages = 1
  try {
    do {
      // eslint-disable-next-line no-await-in-loop
      const res = await api.get<T[]>(`${path}?page=${page}&per=100`)
      rows.push(...(res.data ?? []))
      totalPages = Number(res.meta?.total_pages ?? 1)
      page += 1
    } while (page <= totalPages)
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 403) {
      throw new ApiRequestError(error.status, error.code, `${error.message}. ${hint}`)
    }

    throw error
  }

  return rows
}
