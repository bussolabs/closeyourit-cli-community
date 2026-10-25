import {Flags} from '@oclif/core'
import {ErrorCodes} from '../errors/error-codes'

/**
 * The two organization lookups every ticket carries: status and priority (CYCL-34).
 *
 * The server demands both on creation (R422-TICKET-001 "Status must exist and Priority must
 * exist") while the CLI help gave them as optional, and their ids had to be looked up first with
 * `tickets statuses`/`tickets priorities` and pasted as UUIDs. Here live the endpoint to read, the
 * code that applies when the ticket is born without them being given, and the field's name in
 * messages.
 */
export interface TicketLookup {
  /** Organization lookup (not project): the ids are valid for a ticket of any project. */
  path: string
  /** Name of the field in error messages. */
  name: string
  /** The flag that sets it. */
  flag: string
  /** The code that applies when the ticket is born and it was not given. */
  fallback: string
  errorCode: string
}

export const TICKET_STATUS: TicketLookup = {
  path: '/cli/v1/types/ticket_statuses',
  name: 'Status',
  flag: '--status',
  fallback: 'open',
  errorCode: ErrorCodes.TicketStatus.notFound,
}

export const TICKET_PRIORITY: TicketLookup = {
  path: '/cli/v1/types/ticket_priorities',
  name: 'Priority',
  flag: '--priority',
  fallback: 'medium',
  errorCode: ErrorCodes.TicketPriority.notFound,
}

/** A lookup entry, as the types endpoint returns it. */
interface LookupRow {
  id?: unknown
  code?: unknown
  label?: unknown
}

/**
 * `--status`/`--priority` of a command that modifies an existing ticket. `--status-id` and
 * `--priority-id` stay as aliases: they were the only way to give them, and the scripts that use
 * them keep working without rewrites.
 */
export const ticketLookupFlags = {
  status: Flags.string({
    aliases: ['status-id'],
    description: 'Status code, label or id (e.g. open, "In Progress") — unchanged when omitted',
  }),
  priority: Flags.string({
    aliases: ['priority-id'],
    description: 'Priority code, label or id (e.g. medium, High) — unchanged when omitted',
  }),
}

/** The same two flags on a command that creates the ticket, where omitting them has a default. */
export const newTicketLookupFlags = {
  status: Flags.string({
    aliases: ['status-id'],
    description: `Status code, label or id (e.g. open, "In Progress") — default: ${TICKET_STATUS.fallback}`,
  }),
  priority: Flags.string({
    aliases: ['priority-id'],
    description: `Priority code, label or id (e.g. medium, High) — default: ${TICKET_PRIORITY.fallback}`,
  }),
}

/**
 * The entries matching the hand-written reference: code first, then label, case-insensitively.
 * The code takes precedence because it is the entry's exact name: without that, another entry's
 * label ("Urgent" on `high`) would compete with the code of the one looked for (`urgent`) and a
 * legitimate choice would become an ambiguity to refuse.
 */
export function matchTicketLookup(rows: unknown, value: string): Array<{id: string}> {
  const wanted = value.trim().toLowerCase()
  const list = (Array.isArray(rows) ? rows : []) as LookupRow[]
  const identified = list.filter((row): row is LookupRow & {id: string} => typeof row.id === 'string' && row.id !== '')
  const sameAs = (field: unknown): boolean => typeof field === 'string' && field.trim().toLowerCase() === wanted

  const byCode = identified.filter((row) => sameAs(row.code))
  return byCode.length > 0 ? byCode : identified.filter((row) => sameAs(row.label))
}

/**
 * The rejection of a reference that does not resolve: it says what was looked for, how the flag is
 * written and which entries really exist — so discovering them does not cost a second command.
 */
export function ticketLookupErrorMessage(
  lookup: TicketLookup,
  wanted: string,
  rows: unknown,
  {matched, isDefault}: {matched: number; isDefault: boolean},
): string {
  const known = (Array.isArray(rows) ? (rows as LookupRow[]) : [])
    .map((row) => (typeof row.code === 'string' && row.code !== '' ? row.code : String(row.label ?? '')))
    .filter((name) => name !== '')
    .join(', ')
  const hint = `Pass ${lookup.flag} with a code, a label or an id${known === '' ? '' : ` — known: ${known}`}.`

  if (matched > 1) return `${lookup.name} "${wanted}" matches ${matched} entries. ${hint}`
  if (isDefault) {
    return `This organization has no ${lookup.name.toLowerCase()} "${wanted}", the default for a new ticket. ${hint}`
  }

  return `${lookup.name} not found: "${wanted}". ${hint}`
}
