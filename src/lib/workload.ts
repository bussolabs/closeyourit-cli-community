import {Flags} from '@oclif/core'
import {sanitize} from './output'

/**
 * The non-dev workload board (trade fairs, printed material, meetings, calls): a single
 * organization collection, with the TEAM as tenancy root and not the project — which is why the
 * endpoint is not nested under `/projects/:id` like almost everything else in the CLI.
 */
export const WORKLOAD_ACTIONS_PATH = '/cli/v1/workload/actions'

/** The server enum states, in the order an activity goes through them. */
export const WORKLOAD_STATUSES = ['planned', 'in_progress', 'done', 'cancelled']

/**
 * The fields that `workload create` and `workload update` write the same way. The title stays out:
 * it is required on creation and optional on update. So does the team — it is immutable on the
 * server side (moving an activity would change who sees it), so it is only given when the
 * activity is born.
 */
export const actionFieldFlags = {
  description: Flags.string({description: 'What the activity is about (free text)'}),
  status: Flags.string({
    description: `Status (${WORKLOAD_STATUSES.join(', ')})`,
    options: WORKLOAD_STATUSES,
  }),
  'scheduled-at': Flags.string({description: 'When it takes place (ISO 8601)'}),
  'due-at': Flags.string({description: 'Deadline (ISO 8601)'}),
  ticket: Flags.string({
    description: 'Link an existing ticket by code (e.g. DRFL-3) or id — pass an empty string to unlink',
  }),
}

type ActionFlags = Record<string, unknown>

/** Fills `body` with the scalar fields present in the flags (snake_case keys expected by the CLI API). */
export function applyActionBody(body: ActionFlags, flags: ActionFlags): void {
  if (flags.description !== undefined) body.description = flags.description
  if (flags.status !== undefined) body.status = flags.status
  if (flags['scheduled-at'] !== undefined) body.scheduled_at = flags['scheduled-at']
  if (flags['due-at'] !== undefined) body.due_at = flags['due-at']
}

/**
 * True when the given ticket did NOT end up on the activity: the server silently replaces with
 * "no ticket" an id the writer cannot see (anti-BOLA), and without saying so the activity would
 * look linked to whoever just saved it — while it is not. False when there was nothing to link
 * (flag absent, or an empty string that unlinks on purpose) or when the link is really there.
 *
 * On update the consequence is heavier than on creation — that silence also removes the ticket
 * that was there before — so each command writes the actual warning itself.
 */
export function ticketLinkMissing(
  reference: string | undefined,
  resolvedId: string | undefined,
  data: Record<string, unknown>,
): boolean {
  if (!reference || !resolvedId) return false

  return data.ticket_id !== resolvedId
}

/** The participants line: `renderRecord` prints only scalar fields, and the names are a list. */
export function participantsLine(data: Record<string, unknown>): string {
  const names = (Array.isArray(data.participants) ? data.participants : []).map((name) => sanitize(name))
  return `participants: ${names.length > 0 ? names.join(', ') : '-'}`
}
