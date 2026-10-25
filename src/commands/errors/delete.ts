import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class ErrorsDelete extends BaseCommand {
  static description = 'Delete an error group and every occurrence it holds (irreversible)'

  static examples = ['<%= config.bin %> errors delete <group-id> --project acme-api --confirm']

  static args = {
    id: Args.string({description: 'Error group id', required: true}),
  }

  static flags = {
    ...projectFlag,
    confirm: Flags.boolean({description: 'Required: confirm the irreversible deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ErrorsDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm (the group and its occurrences are gone for good).', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.delete(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/error_groups/${encodeURIComponent(args.id)}`,
    )

    if (!this.jsonEnabled()) {
      this.log(`Deleted error group ${args.id} and its occurrences.`)
    }

    return res
  }
}
