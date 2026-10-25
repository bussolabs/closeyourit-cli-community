import {ApiRequestError} from './api'

/** Shape of `error.details` on a 409 R409-LEASE-001 (see the backend lease contract, CYCL-14). */
interface LeaseConflictDetails {
  holder?: {
    held_by?: {kind?: string; id?: string; name?: string}
    expires_at?: string
  }
}

/** The one shape both `describeLeaseConflict` and `leaseErrorEnvelope` care about, pulled out once. */
interface LeaseHolder {
  kind: string
  id: string
  name?: string
  expiresAt?: string
}

/** Extract `{kind,id,name?,expiresAt?}` from a 409's `details`, or undefined if the shape doesn't match. */
function parseLeaseHolder(details: unknown): LeaseHolder | undefined {
  const holder = (details as LeaseConflictDetails | undefined)?.holder
  const heldBy = holder?.held_by
  if (!heldBy?.kind || !heldBy.id) return undefined
  return {kind: heldBy.kind, id: heldBy.id, name: heldBy.name, expiresAt: holder?.expires_at}
}

/**
 * On a 409 lease conflict, rewrite the error message to name who holds the ticket and until when.
 * An automation reading "R409-LEASE-001: Ticket is already leased" alone cannot decide whether to
 * skip to the next ticket — it needs the holder. Every other status/code (and a 409 without the
 * expected `details.holder` shape) passes through untouched, so unrelated errors keep the server's
 * own wording. Human-mode only: `--json` prints its own full envelope instead (see
 * `leaseErrorEnvelope`), so it never goes through this rewrite.
 */
export function describeLeaseConflict(error: unknown): unknown {
  if (!(error instanceof ApiRequestError) || error.status !== 409) return error

  const holder = parseLeaseHolder(error.details)
  if (!holder) return error

  const who = holder.name ? `${holder.kind} "${holder.name}"` : `${holder.kind} ${holder.id}`
  const until = holder.expiresAt ? ` until ${holder.expiresAt}` : ''
  return new ApiRequestError(error.status, error.code, `Ticket already leased by ${who}${until}.`, error.details)
}

/** Allow-listed `details` for the --json envelope: only the fields a lease conflict is documented to carry. */
interface LeaseErrorDetails {
  holder: {
    held_by: {kind: string; id: string; name?: string}
    expires_at?: string
  }
}

/**
 * Full `{error:{code,message,details}}` envelope for a lease command failure in `--json` mode.
 * `BaseCommand.catch` — shared by every command in the CLI — only ever emits `{code,message}`; a
 * script reading `--json` on a 409 needs `details.holder` too (who holds the ticket, until when),
 * so lease commands print this themselves and return before the error reaches `catch()`, instead of
 * changing that shared, cross-cutting behaviour (out of scope for CYCL-14).
 *
 * `details` is rebuilt field-by-field from an explicit allow-list (`holder.held_by.{kind,id,name}`,
 * `holder.expires_at`) instead of forwarding `error.details` verbatim — same reasoning as
 * `BaseCommand.catch`'s own allow-listed envelope (see `base.ts`): never serialize a server-shaped
 * object of arbitrary provenance straight into `--json` output. Any other field the backend happens
 * to send inside `details` (e.g. a stray `holder.ticket`) is dropped, not forwarded.
 *
 * Returns undefined for anything that isn't an `ApiRequestError`: callers should let those propagate
 * to `catch()` as usual.
 */
export function leaseErrorEnvelope(
  error: unknown,
): {error: {code: string; message: string; details?: LeaseErrorDetails}} | undefined {
  if (!(error instanceof ApiRequestError)) return undefined

  const holder = parseLeaseHolder(error.details)
  const details: LeaseErrorDetails | undefined = holder
    ? {
        holder: {
          held_by: holder.name ? {kind: holder.kind, id: holder.id, name: holder.name} : {kind: holder.kind, id: holder.id},
          ...(holder.expiresAt ? {expires_at: holder.expiresAt} : {}),
        },
      }
    : undefined

  return {error: {code: error.code, message: error.message, details}}
}
