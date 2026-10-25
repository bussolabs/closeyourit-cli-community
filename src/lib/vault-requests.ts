import {ApiRequestError} from './api'

/** Org-level collection of the secret changes waiting for a second approval (CYCL-40). */
export const CHANGE_REQUESTS_PATH = '/cli/v1/vault/change_requests'

/**
 * A copy of a change-request row without the proposed value.
 *
 * `SecretChangeRequestSerializer` never ships `value` — it is encrypted at rest and a change
 * request is only ever allowed to reveal the NAME and the intent. This strips it anyway, on both
 * the human and the `--json` path: the CLI decides what leaves the terminal, so a payload that one
 * day carried the secret (a serializer edit, a proxy, a hand-rolled backend) cannot leak it through
 * a command whose whole point is reviewing secrets without seeing them.
 */
export function withoutValue<T>(row: T): T {
  if (row === null || typeof row !== 'object') return row
  const {value: _value, ...rest} = row as Record<string, unknown>
  return rest as T
}

/** `key` of the project the change belongs to (its name as a fallback), or '' when the payload is silent. */
function projectLabel(row: Record<string, unknown>): string {
  const project = (row.project ?? {}) as {key?: unknown; name?: unknown}
  return String(project.key ?? project.name ?? '')
}

/** `code` of the target environment (its label as a fallback), or '' when the payload is silent. */
function environmentLabel(row: Record<string, unknown>): string {
  const environment = (row.environment ?? {}) as {code?: unknown; label?: unknown}
  return String(environment.code ?? environment.label ?? '')
}

/**
 * Who asked for the change: name, email as a fallback, '' when nobody is attached. The requester FK
 * is nullified when the account is deleted (the audit outlives the person), so this is a real case,
 * not a defensive flourish.
 */
function requesterLabel(row: Record<string, unknown>): string {
  const requester = (row.requested_by ?? {}) as {email?: unknown; name?: unknown}
  return String(requester.name ?? requester.email ?? '')
}

/** One row of `vault requests list`: never the value, only what identifies the pending change. */
export function changeRequestRow(row: Record<string, unknown>): string[] {
  return [
    String(row.id ?? ''),
    projectLabel(row),
    environmentLabel(row),
    String(row.action ?? ''),
    String(row.name ?? ''),
    requesterLabel(row),
    String(row.created_at ?? ''),
  ]
}

/** Column headers of `vault requests list`, in the order `changeRequestRow` fills them. */
export const CHANGE_REQUEST_HEADERS = ['ID', 'PROJECT', 'ENVIRONMENT', 'ACTION', 'NAME', 'REQUESTED BY', 'ASKED AT']

/**
 * Short human wording of what a request is about — `STRIPE_KEY (set) on ACME/production`. Empty when
 * the payload names nothing, so the caller can fall back to a bare confirmation instead of printing
 * a line full of question marks.
 */
export function changeRequestLabel(row: Record<string, unknown>): string {
  const name = String(row.name ?? '').trim()
  if (name === '') return ''
  const action = String(row.action ?? '').trim()
  const where = [projectLabel(row), environmentLabel(row)].filter(Boolean).join('/')
  return [name, action && `(${action})`, where && `on ${where}`].filter(Boolean).join(' ')
}

/**
 * The fields of a decided request worth printing, as an explicit allow-list — the same discipline as
 * `leaseSummary` in `tickets lease claim`: `renderRecord` prints every scalar it is handed, so
 * handing it the raw payload would print whatever the server adds next. Absent/null fields are
 * dropped rather than shown as `-`: an approval has no rejection reason, and a row of dashes reads
 * like missing data instead of "not applicable".
 */
export function changeRequestSummary(row: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    id: row.id,
    project: projectLabel(row) || undefined,
    environment: environmentLabel(row) || undefined,
    name: row.name,
    action: row.action,
    status: row.status,
    requested_by: requesterLabel(row) || undefined,
    requested_at: row.created_at,
    decided_at: row.decided_at,
    reason: row.reason,
  }
  return Object.fromEntries(Object.entries(summary).filter(([, value]) => value !== undefined && value !== null))
}

/**
 * The four ways a decision is refused, each with the way out. The backend codes are stable and its
 * messages are already clear about WHAT happened; what a refusal alone does not say is what to do
 * next — and all four look identical from the outside ("it did not work"), while they call for
 * opposite reactions: hand the request to a colleague, log in as yourself, refresh the queue, write
 * a real reason.
 */
const DECISION_HINTS: Record<string, string> = {
  // Four-eyes separation: whoever decides is never whoever asked (Secrets::ChangeRequests::DecisionGuard).
  'R403-CHANGEREQUEST-001':
    'The four-eyes rule holds here: this one has to be decided by someone else with secrets.manage on that project.',
  // CYRA-640: the second approval is a person's, never a machine's — a service-account token
  // authenticates like a personal one, so the refusal has to name the difference.
  'R403-CHANGEREQUEST-003':
    'Only a person can decide a secret change request: a service account cannot, so run this with your own login.',
  'R409-CHANGEREQUEST-001':
    'It was already decided (applied, rejected or withdrawn) — run "vault requests list" to see what is still waiting.',
  'R422-CHANGEREQUEST-001':
    'Pass a --reason that says why: a rejection freezes the request, and whoever asked needs to know what to fix.',
}

/**
 * Append the way out to a refused decision, keeping the server's own message and code intact — the
 * pattern `fetchLookupRows` already uses on a 403 in `BaseCommand`. Anything else (a 404 on a
 * request outside the visible projects, a plain "Permesso negato" from the RBAC gate, a network
 * failure) passes through untouched: inventing an explanation for an error we have not identified
 * would be worse than the bare code.
 */
export function describeDecisionError(error: unknown): unknown {
  if (!(error instanceof ApiRequestError)) return error
  const hint = DECISION_HINTS[error.code]
  if (!hint) return error
  return new ApiRequestError(error.status, error.code, `${error.message}. ${hint}`, error.details)
}
