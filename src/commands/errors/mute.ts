import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class ErrorsMute extends BaseCommand {
  static description = 'Mute an error group'

  static examples = ['<%= config.bin %> errors mute <group-id> --project acme-api']

  static args = {
    id: Args.string({description: 'Error group id', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ErrorsMute)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.put(`/cli/v1/projects/${projectId}/error_groups/${args.id}/mute`)

    if (!this.jsonEnabled()) {
      this.log(`Error group ${args.id} muted.`)
    }

    return res
  }
}
