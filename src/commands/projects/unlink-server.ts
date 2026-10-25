import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class ProjectsUnlinkServer extends BaseCommand {
  static args = {
    id: Args.string({description: 'Server link id (from projects link-server / project servers list)', required: true}),
  }

  static description = 'Unlink a server host from the project (removes the host↔environment link)'

  static examples = [
    '<%= config.bin %> projects unlink-server <link-id> --project LBRA --confirm',
  ]

  static flags = {
    ...projectFlag,
    confirm: Flags.boolean({description: 'Required: confirm the irreversible unlink'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ProjectsUnlinkServer)

    if (!flags.confirm) {
      this.error('Refusing to unlink without --confirm (the action is irreversible).', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(`/cli/v1/projects/${projectId}/servers/${encodeURIComponent(args.id)}`)

    if (!this.jsonEnabled()) this.log(`Unlinked server ${args.id}`)

    return {unlinked: args.id}
  }
}
