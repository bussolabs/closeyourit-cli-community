import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class ErrorsReopen extends BaseCommand {
  static description = 'Reopen a resolved error group'

  static examples = ['<%= config.bin %> errors reopen <group-id> --project acme-api']

  static args = {
    id: Args.string({description: 'Error group id', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ErrorsReopen)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.delete(`/cli/v1/projects/${projectId}/error_groups/${args.id}/resolution`)

    if (!this.jsonEnabled()) {
      this.log(`Error group ${args.id} reopened.`)
    }

    return res
  }
}
