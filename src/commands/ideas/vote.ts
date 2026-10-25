import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class IdeasVote extends BaseCommand {
  static args = {
    id: Args.string({description: 'Idea id', required: true}),
  }

  static description = 'Upvote an idea (idempotent; only open ideas accept votes)'

  static examples = ['<%= config.bin %> ideas vote <idea-id> --project acme-api']

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(IdeasVote)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.put<{votes_count?: number}>(
      `/cli/v1/projects/${projectId}/ideas/${args.id}/vote`,
    )

    if (!this.jsonEnabled()) {
      const p = res.data ?? {}
      const count = p.votes_count
      this.log(`Voted idea ${args.id}${count === undefined ? '' : ` (${count} votes)`}`)
    }

    return res
  }
}
