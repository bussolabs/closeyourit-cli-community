import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class MonitorsDelete extends BaseCommand {
  static description = 'Delete an uptime monitor (irreversible)'

  static examples = ['<%= config.bin %> monitors delete <monitor-id> --project acme-api --confirm']

  static args = {
    id: Args.string({description: 'Monitor id', required: true}),
  }

  static flags = {
    ...projectFlag,
    confirm: Flags.boolean({description: 'Required: confirm the deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MonitorsDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm.', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/monitors/${encodeURIComponent(args.id)}`,
    )

    if (!this.jsonEnabled()) this.log(`Deleted monitor ${args.id}`)

    return {deleted: args.id}
  }
}
