import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderTable} from '../../lib/output'

export default class TicketsLinks extends BaseCommand {
  // List the ticket↔ticket links (duplicate/related) involving a ticket. Creation lives only in the web
  // dedup flow → not exposed on the CLI; here it's read-only, and `tickets unlink` removes a link.
  static description = 'List the ticket-to-ticket links involving a ticket (duplicate/related)'

  static examples = [
    '<%= config.bin %> tickets links <ticket-id> --project acme-api',
    '<%= config.bin %> tickets links <ticket-id> -p acme-api --json',
  ]

  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsLinks)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Array<Record<string, unknown>>>(
      `/cli/v1/projects/${projectId}/tickets/${args.id}/links`,
    )
    const links = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['ID', 'KIND', 'OTHER_TICKET'],
          links.map((link) => [
            String(link.id ?? ''),
            String(link.kind ?? ''),
            String(link.other_ticket_code ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
