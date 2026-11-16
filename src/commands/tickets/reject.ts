import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TicketsReject extends BaseCommand {
  static description = 'Reject a ticket review: send it back to work with a reason'

  static examples = [
    '<%= config.bin %> tickets reject <ticket-id> --project acme-api --reason "Edge case not covered"',
    '<%= config.bin %> tickets reject CYRA-12 --project CYRA --reason "Cover the empty input too" --rework',
  ]

  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static flags = {
    ...projectFlag,
    reason: Flags.string({description: 'Why the review is rejected (posted as a comment)', required: true}),
    rework: Flags.boolean({
      description: 'On agent work: send it back to the agent, which reads the reason on its next run. Without it the ticket is left to a person',
      default: false,
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsReject)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/tickets/${args.id}/review/rejection`,
      flags.rework ? {reason: flags.reason, mode: 'rework'} : {reason: flags.reason},
    )

    if (!this.jsonEnabled()) {
      this.log(`Ticket ${args.id} review rejected, ${flags.rework ? 'sent back to the agent' : 'sent back to work'}:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
