import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {LENGTH_LIMITS, tooLongMessage} from '../../lib/limits'
import {renderRecord} from '../../lib/output'
import {
  CLEARABLE_FIELDS,
  applyTicketBody,
  applyTicketClears,
  clearFlag,
  ticketBodyFlags,
  ticketLengthChecks,
} from '../../lib/ticket-body'
import {TICKET_PRIORITY, TICKET_STATUS} from '../../lib/ticket-lookup'

/** Fields the ticket GET already returns with the key and value the PUT expects. */
const PRESERVED_KEYS = ['title', 'kind', 'description', 'technical_analysis', 'weight', 'due_at', 'parent_id']

export default class TicketsUpdate extends BaseCommand {
  // PUT /cli/v1/projects/:p/tickets/:id maps to Ticketing::UpdateTicket, a full replace built for the
  // web form, which always posts every field: whatever the body omits is cleared server-side, and
  // status/priority are mandatory, so `--title` alone did not even go through ("Priority must exist")
  // while a body carrying them silently emptied description, technical analysis, weight, due date,
  // assignee, milestone and platforms (CYCL-30).
  //
  // The command now reads the ticket first and re-sends its current state under the flags you passed:
  // what you do not name stays as it was. Emptying is a separate, explicit request (`--clear <field>`),
  // and `--replace` keeps the raw full replace for callers that really do send the whole desired state.
  //
  // Scenarios and conditions stay out of the merge: the backend replaces them when the body carries
  // new ones and leaves them untouched otherwise, so re-sending them would only risk duplicates.
  //
  // Known limit — the read and the write are not one atomic operation, and this endpoint offers no
  // optimistic locking (no lock_version, no If-Match/ETag: the GET exposes nothing to send back),
  // so an edit landing between them is overwritten by the state this command read. It cannot be
  // fixed from the client alone, and it is strictly narrower than what it replaces: the full replace
  // wiped those fields on EVERY call, concurrency or not, while here the exposure is the round trip.
  // Closing it for good needs a server-side merge (or a version token to send back) — the fix the
  // ticket calls the "server remedy".
  static description =
    'Update a ticket, changing only the fields you pass (the others keep their current value; use --clear to empty one, --replace for the raw full replace)'

  static examples = [
    '<%= config.bin %> tickets update <ticket-id> --project acme-api --title "New title"',
    '<%= config.bin %> tickets update <ticket-id> -p acme-api --clear assignee --clear due-at',
    '<%= config.bin %> tickets update <ticket-id> -p acme-api --title "Login bug" --scenarios \'[{"step_given":"logged out","step_when":"I submit","step_then":"it 500s","step_expected":"dashboard loads"}]\' --condition "login works"',
    '<%= config.bin %> tickets update <ticket-id> -p acme-api --status in_review --priority High',
    '<%= config.bin %> tickets update <ticket-id> -p acme-api --replace --title "Only this" --status open --priority medium',
  ]

  static args = {
    id: Args.string({description: 'Ticket id', required: true}),
  }

  static flags = {
    ...projectFlag,
    title: Flags.string({description: `Ticket title (max ${LENGTH_LIMITS.title} characters)`}),
    kind: Flags.string({description: 'Ticket kind (bug, story, task, epic)', options: ['bug', 'story', 'task', 'epic']}),
    ...ticketBodyFlags,
    ...clearFlag,
    replace: Flags.boolean({
      description: 'Send only the flags you passed (full replace — every field you omit is cleared server-side)',
      default: false,
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsUpdate)
    const projectId = await this.resolveProjectId(flags.project)
    const path = `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}`

    const requested: Record<string, unknown> = {}
    if (flags.title !== undefined) requested.title = flags.title
    if (flags.kind !== undefined) requested.kind = flags.kind
    applyTicketBody(requested, flags)
    // Changing status or priority no longer forces looking up its id first: the code or the label
    // are enough, and an id passes through as is (CYCL-34).
    if (flags.status !== undefined) {
      requested.status_id = await this.resolveTicketLookupId(TICKET_STATUS, flags.status)
    }

    if (flags.priority !== undefined) {
      requested.priority_id = await this.resolveTicketLookupId(TICKET_PRIORITY, flags.priority)
    }

    this.refuseClearConflicts(requested, flags.clear)
    applyTicketClears(requested, flags.clear)

    let body = requested
    if (!flags.replace) {
      const ticket = (await this.api.get<Record<string, unknown>>(path)).data ?? {}

      // Too-long fields are found here, all together, instead of one per rejection (CYCL-32).
      // The current value acts as safeguard: a text written before the cap existed stays fixable as
      // long as it does not grow, as on the server. With `--replace` the current state is not read,
      // so the safeguard cannot be computed and the measurement is left to the server.
      const tooLong = tooLongMessage(ticketLengthChecks(flags, ticket))
      if (tooLong) this.error(tooLong, {exit: 2})

      body = {...(await this.currentState(projectId, ticket, requested)), ...requested}
    }

    const res = await this.api.put<Record<string, unknown>>(path, body)

    if (!this.jsonEnabled()) {
      this.log('Ticket updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }

  /**
   * The ticket's current state, in the shape the PUT expects, only for the fields the command's
   * author has not already decided. Empty fields stay out of the body: omitting them or sending
   * them as null is the same thing, and the body stays readable.
   */
  private async currentState(
    projectId: string,
    ticket: Record<string, unknown>,
    requested: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const current: Record<string, unknown> = {}

    for (const key of PRESERVED_KEYS) {
      const value = ticket[key]
      if (key in requested || value === null || value === undefined || value === '') continue
      current[key] = value
    }

    // Status and priority are mandatory for the backend: without them the update fails. The GET
    // exposes the status id, while for the priority it gives only the label, to look up again.
    if (!('status_id' in requested)) {
      const statusId = (ticket.status_ref as {id?: unknown} | undefined)?.id
      if (typeof statusId !== 'string' || statusId === '') {
        this.error('Cannot read the current status of this ticket: pass --status <code|label|id> or use --replace.', {
          exit: 2,
        })
      }

      current.status_id = statusId
    }

    if (!('priority_id' in requested)) {
      current.priority_id = await this.lookupId(TICKET_PRIORITY.path, ticket.priority, 'priority', '--priority')
    }

    if (!('assignee_id' in requested) && ticket.assignee) {
      current.assignee_id = await this.lookupId('/cli/v1/members', ticket.assignee, 'assignee', '--assignee-id', 'account_id')
    }

    if (!('milestone_id' in requested) && ticket.milestone) {
      const milestones = `/cli/v1/projects/${encodeURIComponent(projectId)}/milestones`
      current.milestone_id = await this.lookupId(milestones, ticket.milestone, 'milestone', '--milestone-id')
    }

    const platforms = Array.isArray(ticket.platforms) ? ticket.platforms : []
    if (!('platform_ids' in requested) && platforms.length > 0) {
      const rows = await this.lookupRows('/cli/v1/platforms')
      current.platform_ids = platforms.map((platform) => this.matchId(rows, platform, 'platform', '--platform-id'))
    }

    return current
  }

  /** Rejects `--clear x` together with `--x`: setting and clearing the same field is an ambiguous request. */
  private refuseClearConflicts(requested: Record<string, unknown>, fields: string[] | undefined): void {
    for (const field of fields ?? []) {
      if (CLEARABLE_FIELDS[field] in requested) {
        this.error(`--clear ${field} conflicts with the value passed for the same field: pick one.`, {exit: 2})
      }
    }
  }

  /** Id of the lookup entry matching the label shown by the ticket GET. */
  private async lookupId(
    path: string,
    label: unknown,
    field: string,
    flag: string,
    idKey = 'id',
  ): Promise<string> {
    const rows = await this.lookupRows(path)
    return this.matchId(rows, label, field, flag, idKey)
  }

  /**
   * A lookup not found or ambiguous stops the command: going on would send a PUT without that
   * field, i.e. it would silently erase it — the flaw this command exists to avoid.
   */
  private matchId(
    rows: Array<Record<string, unknown>>,
    label: unknown,
    field: string,
    flag: string,
    idKey = 'id',
  ): string {
    const wanted = String(label ?? '').toLowerCase()
    const matches = rows.filter((row) =>
      [row.label, row.code, row.name].some((value) => typeof value === 'string' && value.toLowerCase() === wanted),
    )

    if (matches.length !== 1 || typeof matches[0][idKey] !== 'string') {
      const reason = matches.length > 1 ? `${matches.length} entries match it` : 'no entry matches it'
      this.error(
        `Cannot keep the current ${field} "${String(label ?? '')}": ${reason}. Pass ${flag} <id> or use --replace.`,
        {exit: 2},
      )
    }

    return matches[0][idKey] as string
  }

  /** Every page of a lookup endpoint: the entry looked for may be beyond the first one. */
  private async lookupRows(path: string): Promise<Array<Record<string, unknown>>> {
    const rows: Array<Record<string, unknown>> = []
    const separator = path.includes('?') ? '&' : '?'
    let page = 1
    let totalPages = 1
    do {
      // eslint-disable-next-line no-await-in-loop
      const res = await this.api.get<Array<Record<string, unknown>>>(`${path}${separator}page=${page}&per=100`)
      rows.push(...(Array.isArray(res.data) ? res.data : []))
      totalPages = Number(res.meta?.total_pages ?? 1)
      page += 1
    } while (page <= totalPages)

    return rows
  }
}
