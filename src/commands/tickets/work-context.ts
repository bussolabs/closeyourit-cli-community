import {Args, Flags} from '@oclif/core'

import {BaseCommand, projectFlag} from '../../base'
import {ApiRequestError} from '../../lib/api'
import {renderGuidance} from '../../lib/guidance'
import {renderRecord, sanitize, sanitizeMultiline, section} from '../../lib/output'

/** A frozen entry (reference or procedure) inside the snapshot payload. */
interface FrozenEntry extends Record<string, unknown> {
  content?: string
  instructions?: string
  key?: string
  level?: string
  location?: string
}

export default class TicketsWorkContext extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static description =
    "Show the work context frozen when an automation host claimed the ticket: the references and procedures actually delivered back then, never the project's current guidance"

  static examples = [
    '<%= config.bin %> tickets work-context <ticket-id> --project acme-api',
    '<%= config.bin %> tickets work-context DRFL-3 -p driverone-flutter',
    '<%= config.bin %> tickets work-context DRFL-3 -p driverone-flutter --full',
    '<%= config.bin %> tickets work-context DRFL-3 -p driverone-flutter --json',
  ]

  static flags = {
    ...projectFlag,
    full: Flags.boolean({
      description: 'Also print the frozen text of every reference and procedure, not just the table',
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsWorkContext)
    const projectId = await this.resolveProjectId(flags.project)
    const path = `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/work_context`

    // A single read, and on the snapshot endpoint: never a fallback to /guidance. The project
    // guidance may have changed after the claim, and showing it instead of the snapshot would mean
    // answering an audit with today's configuration (CYCL-47, scenario 1).
    let res
    try {
      res = await this.api.get<Record<string, unknown>>(path)
    } catch (error) {
      throw describeWorkContextError(error, args.id)
    }

    if (!this.jsonEnabled()) {
      const snapshot = res.data ?? {}
      this.log(
        `Work context frozen when ${sanitize(args.id)} was claimed from the agent queue — not the project's current guidance (that is \`guidance show\`).`,
      )
      this.log(renderRecord(snapshotSummary(snapshot)))
      this.renderPayload(snapshot.payload, flags.full)
    }

    return res
  }

  /** The two frozen lists: same table as `guidance show`, so the comparison with today is immediate. */
  private renderPayload(payload: unknown, full: boolean): void {
    const rendered = renderGuidance(payload)
    if (!rendered) {
      this.log('\nThis snapshot froze no references and no procedures.')
      return
    }

    this.log(rendered)
    if (!full) {
      this.log('\nPass --full to read the frozen text of each reference and procedure.')
      return
    }

    // The full text is the heart of the audit (the instructions delivered, not just their keys),
    // but on a rich guidance it is thousands of characters: it sits behind --full so it does not turn
    // every quick read into a wall of text. In --json everything is always there anyway.
    const body = renderFrozenText(payload)
    if (body) this.log(body)
  }
}

/** Snapshot header: who received it, when, with which schema version and digest. */
function snapshotSummary(snapshot: Record<string, unknown>): Record<string, unknown> {
  return {
    snapshot_id: snapshot.id ?? null,
    captured_at: snapshot.generated_at ?? null,
    captured_by: snapshot.actor_name ?? null,
    payload_version: snapshot.payload_version ?? null,
    digest: snapshot.digest ?? null,
  }
}

/** The entries of a payload list, or [] if the backend did not send it. */
function entries(value: unknown): FrozenEntry[] {
  return Array.isArray(value) ? (value as FrozenEntry[]) : []
}

/**
 * The frozen text of every entry that has one: the `instructions` of a reference, the `content`
 * of a procedure. Returns '' when no entry carries text, so `--full` on a keys-only snapshot does
 * not print a heading over an empty section.
 */
function renderFrozenText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const value = payload as {procedures?: unknown; references?: unknown}
  const blocks = [
    ...entries(value.references).map((entry) => frozenBlock(entry, entry.instructions)),
    ...entries(value.procedures).map((entry) => frozenBlock(entry, entry.content)),
  ].filter((block) => block.length > 0)
  if (blocks.length === 0) return ''

  return `${section('Frozen text', '🧊')}\n${blocks.join('\n')}`
}

/** An entry with its text: header line (key · level · position) and full text. */
function frozenBlock(entry: FrozenEntry, text: unknown): string {
  const body = String(text ?? '')
  if (body.trim() === '') return ''

  const head = [entry.key, entry.level, entry.location].filter((part) => part !== undefined && part !== null && part !== '')
  return `\n── ${head.map((part) => sanitize(part)).join(' · ')}\n${sanitizeMultiline(body)}`
}

/**
 * Rewrites the two rejections a reader would misunderstand, leaving everything else intact (server
 * code included, so a script can still tell them apart):
 *
 * - `R404-TICKET-004` is not "ticket not found": the ticket is there, it is the snapshot that is
 *   missing. Saying "never claimed", though, would be a convenient lie: the snapshot is taken ONLY
 *   by a claim from the automatic hosts' queue (Agents::TicketQueues::Claim), so a ticket taken by
 *   hand — with `tickets lease claim` or by assigning it — has none, and neither do tickets claimed
 *   before the snapshot existed. The message says what is missing and why it may be missing, so
 *   the reader does not conclude that nobody ever worked on it.
 * - the 403 arrives as a bare "Permission denied": here the missing key is `tickets.audit.view`,
 *   which is dedicated to audit material — seeing the ticket, or its guidance, is not enough.
 */
function describeWorkContextError(error: unknown, ticketRef: string): unknown {
  if (!(error instanceof ApiRequestError)) return error

  if (error.status === 404 && error.code === 'R404-TICKET-004') {
    return new ApiRequestError(
      error.status,
      error.code,
      `No work context was captured for ticket ${ticketRef}: the snapshot is taken only when an automation host claims the ticket from the queue, so a manual claim — or one older than the snapshot itself — leaves none behind.`,
      error.details,
    )
  }

  if (error.status === 403) {
    return new ApiRequestError(
      error.status,
      error.code,
      `${error.message}. Reading a work context needs the tickets.audit.view permission: it is audit material, seeing the ticket is not enough.`,
      error.details,
    )
  }

  return error
}
