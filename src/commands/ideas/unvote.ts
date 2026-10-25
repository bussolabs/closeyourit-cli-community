import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class IdeasUnvote extends BaseCommand {
  static args = {
    id: Args.string({description: 'Idea id', required: true}),
  }

  static description = 'Remove your upvote from an idea (idempotent)'

  static examples = ['<%= config.bin %> ideas unvote <idea-id> --project acme-api']

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(IdeasUnvote)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.delete<{votes_count?: number}>(
      `/cli/v1/projects/${projectId}/ideas/${args.id}/vote`,
    )

    if (!this.jsonEnabled()) {
      const p = res.data ?? {}
      const count = p.votes_count
      this.log(`Removed vote from idea ${args.id}${count === undefined ? '' : ` (${count} votes)`}`)
    }

    return res
  }
}
