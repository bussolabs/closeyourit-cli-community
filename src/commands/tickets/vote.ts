import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class TicketsVote extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id', required: true}),
  }

  static description = 'Upvote a ticket (idempotent)'

  static examples = ['<%= config.bin %> tickets vote <ticket-id> --project acme-api']

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsVote)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.put<{votes_count?: number}>(
      `/cli/v1/projects/${projectId}/tickets/${args.id}/vote`,
    )

    if (!this.jsonEnabled()) {
      const p = res.data ?? {}
      const count = p.votes_count
      this.log(`Voted ticket ${args.id}${count === undefined ? '' : ` (${count} votes)`}`)
    }

    return res
  }
}
