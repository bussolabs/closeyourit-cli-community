import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TicketsWatch extends BaseCommand {
  // Watch a ticket to receive its notifications (idempotent). Anyone who can see the ticket may watch it:
  // participation IS the gate, no permission key. To stop: tickets unwatch.
  static description = 'Watch a ticket to receive its notifications (idempotent)'

  static examples = ['<%= config.bin %> tickets watch <ticket-id> --project acme-api']

  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsWatch)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/tickets/${args.id}/watch`,
    )

    if (!this.jsonEnabled()) {
      this.log(`Watching ticket ${args.id}:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
