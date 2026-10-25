import {ApiRequestError} from './api'
import {ErrorCodes} from '../errors/error-codes'

/**
 * Reading and correcting a service account without recreating it (CYCL-46).
 *
 * One rule runs through everything here: on the secret boundary of a service account, an EMPTY list
 * of environment codes does not mean "no access", it means "every environment". So the empty list is
 * never a neutral value to fall into by accident — it is a decision, and it has to be printed with
 * words that cannot be misread.
 */

/** The boundary in words: the codes, or the fact that there is no boundary at all. */
export function environmentsLine(codes: unknown): string {
  const list = normalizeEnvironmentCodes(Array.isArray(codes) ? (codes as unknown[]) : [])
  return `secret environments: ${list.length > 0 ? list.join(', ') : 'all (no restriction)'}`
}

/**
 * Environment codes the way the server stores them: trimmed, lowercase, each one once, blanks
 * dropped — the same normalisation `Connections::SetSecretAccess#sanitize` applies before saving.
 * Sending them already in that shape is what makes "what I asked for" and "what came back"
 * comparable at all: otherwise ` Staging ` would look dropped every single time.
 */
export function normalizeEnvironmentCodes(values: unknown[]): string[] {
  const seen = new Set<string>()
  const codes: string[] = []
  for (const value of values) {
    const code = String(value ?? '').trim().toLowerCase()
    if (code === '' || seen.has(code)) continue
    seen.add(code)
    codes.push(code)
  }

  return codes
}

/**
 * The fields of a service account worth printing, as an explicit allow-list — the same discipline as
 * `changeRequestSummary`: `renderRecord` prints every scalar it is handed, so handing it the raw
 * payload would print whatever the server adds next, up to and including a field carrying a token.
 * `secret_environment_codes` is left out on purpose: it is an array (renderRecord would swallow it)
 * and it deserves the sentence `environmentsLine` builds, not a bare key.
 */
export function accountSummary(account: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    id: account.id,
    name: account.name,
    handle: account.handle,
    created_at: account.created_at,
    active_tokens_count: account.active_tokens_count,
  }
  return Object.fromEntries(Object.entries(summary).filter(([, value]) => value !== undefined && value !== null))
}

/**
 * A copy of a token row without the secret, on both the human and the `--json` path.
 *
 * `UserApiTokenSerializer` never ships it — the secret exists only in the response of `tokens
 * create`, reveal-once, and in the database there is just a prefix. This strips it anyway, for the
 * same reason `withoutValue` does it on the vault queue: the CLI decides what leaves the terminal,
 * so a payload that one day carried the secret (a serializer edit, a proxy, a hand-rolled backend)
 * cannot turn a plain listing into a second reveal.
 */
export function withoutSecret<T>(row: T): T {
  if (row === null || typeof row !== 'object') return row
  const {secret: _secret, ...rest} = row as Record<string, unknown>
  return rest as T
}

/** `active` while the token works, `revoked` once it has been withdrawn — what the reader is after. */
export function tokenStatus(token: Record<string, unknown>): string {
  return token.revoked_at ? 'revoked' : 'active'
}

/**
 * The requested codes an organization does not declare — checked BEFORE writing.
 *
 * `SetSecretAccess` intersects what it receives with the codes the organization really has and
 * saves what is left, answering 200 either way. On a typo that intersection is empty, and an empty
 * allow-list is not "no environments", it is EVERY environment: `--secret-environment stagin` would
 * hand the account the production secrets it was being restricted away from. Catching it here means
 * the mistake costs an error message instead of an open door.
 *
 * `known` empty is treated as "could not read them" by the caller, not as "nothing is valid": a
 * lookup that came back empty (no permission, a serializer without `code`) must not block a command
 * the caller is entitled to run.
 */
export function unknownEnvironmentCodes(requested: string[], known: string[]): string[] {
  const declared = new Set(normalizeEnvironmentCodes(known))
  return requested.filter((code) => !declared.has(code))
}

/**
 * Refuse an environment boundary the server did not actually put in place.
 *
 * The pre-flight check above catches the typo before it is written, but it cannot be the only
 * guard: reading the environments needs `environments.view`, a permission managing members does not
 * imply, and an environment can be removed between the two calls. So the request and the response
 * are compared here too, and any difference — a code dropped OR a code appearing that nobody asked
 * for, which would mean a wider boundary than requested — is an error, not a footnote.
 *
 * Whatever the server did save stays saved (the boundary is one call away from being fixed, and
 * rolling it back blindly could lock out an agent mid-run), but the command says so and exits
 * non-zero — the same shape as `assertNothingDropped` on a partial bulk triage.
 */
export function assertBoundaryApplied(requested: string[], applied: string[]): void {
  const inForce = applied.length > 0 ? applied.join(', ') : 'all environments (no restriction)'

  // --all-environments: the removal is the whole point, so a boundary still standing means the
  // command did nothing while looking like it worked.
  if (requested.length === 0) {
    if (applied.length === 0) return
    throw new ApiRequestError(
      500,
      ErrorCodes.ServiceAccount.restrictionNotApplied,
      `The restriction was not removed: the account can still read secrets only in ${inForce}. ` +
        'Nothing else changed — run the command again, or check the account from the web vault.',
    )
  }

  const kept = new Set(applied.map((code) => code.toLowerCase()))
  const asked = new Set(requested)
  const dropped = requested.filter((code) => !kept.has(code))
  const extra = applied.filter((code) => !asked.has(code.toLowerCase()))
  if (dropped.length === 0 && extra.length === 0) return

  const what =
    dropped.length > 0
      ? `Not applied: ${dropped.join(', ')} — the server kept a different boundary ` +
        '(an environment removed in the meantime, or a code this organization does not have).'
      : `Applied without being asked for: ${extra.join(', ')} — the boundary is wider than requested ` +
        `(${requested.join(', ')}).`

  throw new ApiRequestError(
    404,
    ErrorCodes.ServiceAccount.boundaryMismatch,
    `${what} In force now: ${inForce}. ` +
      'Run "environments list" to see the real codes, then set the boundary again.',
  )
}
