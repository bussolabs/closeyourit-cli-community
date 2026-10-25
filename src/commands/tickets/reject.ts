import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TicketsReject extends BaseCommand {
  static description = 'Reject a ticket review: send it back to work with a reason'

  static examples = [
    '<%= config.bin %> tickets reject <ticket-id> --project acme-api --reason "Edge case not covered"',
  ]

  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static flags = {
    ...projectFlag,
    reason: Flags.string({description: 'Why the review is rejected (posted as a comment)', required: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsReject)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/tickets/${args.id}/review/rejection`,
      {reason: flags.reason},
    )

    if (!this.jsonEnabled()) {
      this.log(`Ticket ${args.id} review rejected, sent back to work:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
