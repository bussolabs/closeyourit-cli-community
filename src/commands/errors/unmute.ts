import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class ErrorsUnmute extends BaseCommand {
  static description = 'Unmute an error group'

  static examples = ['<%= config.bin %> errors unmute <group-id> --project acme-api']

  static args = {
    id: Args.string({description: 'Error group id', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ErrorsUnmute)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.delete(`/cli/v1/projects/${projectId}/error_groups/${args.id}/mute`)

    if (!this.jsonEnabled()) {
      this.log(`Error group ${args.id} unmuted.`)
    }

    return res
  }
}
