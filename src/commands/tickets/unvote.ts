import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class TicketsUnvote extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id', required: true}),
  }

  static description = 'Remove your upvote from a ticket (idempotent)'

  static examples = ['<%= config.bin %> tickets unvote <ticket-id> --project acme-api']

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsUnvote)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.delete<{votes_count?: number}>(
      `/cli/v1/projects/${projectId}/tickets/${args.id}/vote`,
    )

    if (!this.jsonEnabled()) {
      const p = res.data ?? {}
      const count = p.votes_count
      this.log(`Removed vote from ticket ${args.id}${count === undefined ? '' : ` (${count} votes)`}`)
    }

    return res
  }
}
