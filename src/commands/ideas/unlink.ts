import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class IdeasUnlink extends BaseCommand {
  // DELETE /cli/v1/projects/:p/ideas/:id/links/:other maps to Ideas::UnlinkIdeas: removes the link
  // between the two ideas whichever side wrote it (evolution or related). Same gate as editing.
  static args = {
    id: Args.string({description: 'Idea id', required: true}),
    target: Args.string({description: 'Other idea id', required: true}),
  }

  static description = 'Remove the link between two ideas (evolution or related), from either side'

  static examples = ['<%= config.bin %> ideas unlink <idea-id> <other-idea-id> --project acme-api']

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(IdeasUnlink)
    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(`/cli/v1/projects/${projectId}/ideas/${args.id}/links/${args.target}`)

    if (!this.jsonEnabled()) this.log(`Unlinked ${args.id} and ${args.target}`)

    return {unlinked: [args.id, args.target]}
  }
}
