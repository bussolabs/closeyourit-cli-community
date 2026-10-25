import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TicketsUnwatch extends BaseCommand {
  // Stop watching a ticket (idempotent).
  static description = 'Stop watching a ticket (idempotent)'

  static examples = ['<%= config.bin %> tickets unwatch <ticket-id> --project acme-api']

  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsUnwatch)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.delete<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/tickets/${args.id}/watch`,
    )

    if (!this.jsonEnabled()) {
      this.log(`Stopped watching ticket ${args.id}:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
