import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class ErrorsResolve extends BaseCommand {
  static description = 'Mark an error group as resolved'

  static examples = ['<%= config.bin %> errors resolve <group-id> --project acme-api']

  static args = {
    id: Args.string({description: 'Error group id', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ErrorsResolve)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.put(`/cli/v1/projects/${projectId}/error_groups/${args.id}/resolution`)

    if (!this.jsonEnabled()) {
      this.log(`Error group ${args.id} marked as resolved.`)
    }

    return res
  }
}
