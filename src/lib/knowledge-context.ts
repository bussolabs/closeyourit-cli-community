import {ApiRequestError, type CliApi, type Envelope, type RequestOptions} from './api'
import {ErrorCodes} from '../errors/error-codes'
import {repoSlug} from './git'
import {buildPagesQuery} from './knowledge'

/**
 * A project's knowledge context and the recognition of the project from the git remote.
 *
 * Born inside `kb context` (CYCL-55), it lives here since the MCP server needs it too (CYCL-56):
 * the same tool offered to any assistant must recognise the working folder exactly as the command
 * does, or the two paths would give different answers on the same repo.
 */

/** The part of the project → GitHub repository map this reads (`projects github-map`). */
interface RepositoryMapping {
  project_key?: string
  project_id?: string
  repository?: {full_name?: string} | null
}

/**
 * Does this failure mean the server has no such route? A 404 says so outright; a 500 only when the
 * body was not an error envelope the backend wrote, which is how a missing route surfaces here.
 */
export function isMissingRoute(error: ApiRequestError): boolean {
  if (error.status === 404) return true
  return error.status === 500 && error.code === ErrorCodes.Network.requestFailed
}

/**
 * Ask for the project's knowledge context, falling back to its plain page list on a server that
 * does not expose the context route yet (CYRA-767): the same short list, one call later, instead
 * of a session start that reports a failure the reader can do nothing about.
 *
 * A 500 counts as "route missing" alongside 404, but only when the body was not a backend error
 * envelope: the CLI asks for `Accept: application/json`, a server without the route renders its
 * not-found page, has no JSON template for it, and fails — which arrives here as a plain
 * `Network.requestFailed`. A 500 the backend narrated itself (`R500-…`) is a real fault of a route
 * that exists, and retrying elsewhere would only replace its message with a more confusing one.
 */
export async function fetchKnowledgeContext(
  api: CliApi,
  project: string,
  limit: number,
  opts: RequestOptions = {},
): Promise<Envelope<unknown>> {
  const query = new URLSearchParams({project, per: String(limit)})
  try {
    return await api.get<unknown>(`/cli/v1/knowledge/context?${query.toString()}`, opts)
  } catch (error) {
    if (!(error instanceof ApiRequestError) || !isMissingRoute(error)) throw error
    const pages = buildPagesQuery({kinds: [], page: 1, per: limit, project})
    return api.get<unknown>(`/cli/v1/knowledge/pages?${pages}`, opts)
  }
}

/**
 * The project of `cwd`, matched on its `origin` remote through the project → repository map the
 * backend already publishes (`projects github-map`).
 *
 * The remote was preferred over a local configuration file: it is already written in every
 * repository, so nothing new has to be created, kept in sync, or forgotten in a fresh clone.
 * No remote, no match, no repository at all → undefined, and the caller shows nothing.
 */
export async function projectFromGitRemote(
  api: CliApi,
  cwd: string,
  timeoutMs: number,
  opts: RequestOptions = {},
): Promise<string | undefined> {
  const slug = await repoSlug(cwd, timeoutMs)
  if (slug === undefined) return undefined

  const wanted = slug.toLowerCase()
  let page = 1
  let totalPages = 1
  do {
    const query = new URLSearchParams({page: String(page), per: '100', connected_only: 'true'})
    // eslint-disable-next-line no-await-in-loop
    const res = await api.get<RepositoryMapping[]>(`/cli/v1/projects/github-map?${query.toString()}`, opts)
    const match = (res.data ?? []).find((row) => (row.repository?.full_name ?? '').toLowerCase() === wanted)
    if (match) return match.project_key ?? match.project_id
    totalPages = Number(res.meta?.total_pages ?? 1)
    page += 1
  } while (page <= totalPages)

  return undefined
}
