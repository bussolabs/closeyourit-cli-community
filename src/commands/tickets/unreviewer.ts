import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TicketsUnreviewer extends BaseCommand {
  // Remove the reviewer of a ticket (the backend gates `tickets.assign`; idempotent).
  static description = 'Remove the reviewer of a ticket (requires tickets.assign)'

  static examples = ['<%= config.bin %> tickets unreviewer <ticket-id> --project acme-api']

  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsUnreviewer)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.delete<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/tickets/${args.id}/reviewer`,
    )

    if (!this.jsonEnabled()) {
      this.log(`Ticket ${args.id} reviewer removed:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
