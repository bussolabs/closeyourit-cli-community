import {Args} from '@oclif/core'

import {BaseCommand, pageFlag, projectFlag} from '../../base'
import {sanitize, sanitizeMultiline} from '../../lib/output'

/** Most characters of one side of a change shown in the human view; --json carries the full text. */
const SIDE_MAX_CHARS = 300

type Change = [string, string]

/**
 * Ticket history, newest first, with what each edit replaced (CYCL-94). Read it before rewriting a
 * ticket: the old text of a field is here, in full with --json.
 */
export default class TicketsHistory extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static description =
    'Show the history of a ticket (newest first): who changed what, with the before and after of each edited field — full texts with --json'

  static examples = [
    '<%= config.bin %> tickets history DRFL-3 --project acme-api',
    '<%= config.bin %> tickets history DRFL-3 -p acme-api --page 2',
    '<%= config.bin %> tickets history DRFL-3 -p acme-api --json',
  ]

  static flags = {...projectFlag, ...pageFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsHistory)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Array<Record<string, unknown>>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/events?page=${flags.page}`,
    )
    const events = res.data ?? []

    if (!this.jsonEnabled()) {
      if (events.length === 0) this.log('(no history)')
      let cut = false
      for (const event of events) {
        this.log(`\n── ${sanitize(event.created_at)} · ${sanitize(event.actor_name ?? '?')} · ${sanitize(event.action)}`)
        if (event.action !== 'updated') continue
        for (const [field, value] of Object.entries((event.data ?? {}) as Record<string, unknown>)) {
          const change = toChange(value)
          if (!change) continue
          this.log(`  ${sanitize(field)}:`)
          for (const [sign, text] of [['-', change[0]], ['+', change[1]]] as const) {
            if (text === '') continue
            cut ||= text.length > SIDE_MAX_CHARS
            this.log(indent(`${sign} ${clip(text)}`))
          }
        }
      }

      if (cut) this.log('\n(long texts are cut: use --json for the full before and after)')
      const totalPages = Number(res.meta?.total_pages ?? 1)
      if (totalPages > 1) this.log(`\npage ${flags.page} of ${totalPages} — next with --page ${flags.page + 1}`)
    }

    return res
  }
}

/** The shapes an edit is stored in: [before, after], {from, to}, or {added, removed} for lists. */
function toChange(value: unknown): Change | undefined {
  if (Array.isArray(value) && value.length === 2) return [text(value[0]), text(value[1])]
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if ('from' in record) return [text(record.from), text(record.to)]
    if ('added' in record) return [list(record.removed), list(record.added)]
  }

  return undefined
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function list(value: unknown): string {
  return Array.isArray(value) ? value.map((item) => text(item)).join(', ') : ''
}

function clip(value: string): string {
  return value.length > SIDE_MAX_CHARS ? `${value.slice(0, SIDE_MAX_CHARS)}…` : value
}

function indent(value: string): string {
  return sanitizeMultiline(value)
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')
}
