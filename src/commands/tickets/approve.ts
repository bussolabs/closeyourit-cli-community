import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TicketsApprove extends BaseCommand {
  static description = 'Approve a ticket review: move it to the first done status'

  static examples = ['<%= config.bin %> tickets approve <ticket-id> --project acme-api']

  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsApprove)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/tickets/${args.id}/review/approval`,
    )

    if (!this.jsonEnabled()) {
      this.log(`Ticket ${args.id} review approved:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
