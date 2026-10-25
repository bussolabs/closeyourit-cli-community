import {Args} from '@oclif/core'

import {BaseCommand, projectFlag} from '../../../base'
import {renderTable, sanitize} from '../../../lib/output'

/** A list entry: the data belongs to the BLOCKER, `id` is the dependency handle for remove. */
interface Dependency {
  id?: unknown
  hidden?: unknown
  code?: unknown
  title?: unknown
  done?: unknown
  status?: {label?: unknown; code?: unknown} | null
}

export default class TicketsDependenciesList extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. CYRA-132)', required: true}),
  }

  static description =
    'List the prerequisites of a ticket: what has to be finished before this one can start'

  static examples = [
    '<%= config.bin %> tickets dependencies list CYRA-132 --project closeyourit-rails',
    '<%= config.bin %> tickets dependencies list CYRA-132 -p closeyourit-rails --json',
  ]

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsDependenciesList)
    const projectId = await this.resolveProjectId(flags.project)
    const path = `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/dependencies`

    const res = await this.api.get<Dependency[]>(path)
    const rows = res.data ?? []

    if (!this.jsonEnabled()) {
      // A prerequisite in a product your access cannot see stays VISIBLE as a fact — it exists, and
      // it is done or not — but without code or title. Same rule as the web page: hiding its very
      // existence would say "this ticket is not blocked", which is false and leads to starting.
      this.log(
        renderTable(
          ['ID', 'BLOCKER', 'TITLE', 'STATUS', 'DONE'],
          rows.map((row) => [
            sanitize(row.id ?? ''),
            row.hidden === true ? '(nascosto)' : sanitize(row.code ?? ''),
            row.hidden === true ? '(fuori dal tuo accesso)' : sanitize(row.title ?? ''),
            sanitize(row.status?.label ?? row.status?.code ?? ''),
            row.done === true ? 'sì' : 'no',
          ]),
        ),
      )
    }

    return rows
  }
}
