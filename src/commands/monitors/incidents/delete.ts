import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'

export default class MonitorsIncidentsDelete extends BaseCommand {
  static description = 'Delete an uptime incident (and its grouped windows; irreversible)'

  static examples = ['<%= config.bin %> monitors incidents delete <monitor-id> <incident-id> --project acme-api --confirm']

  static args = {
    monitor: Args.string({description: 'Monitor id', required: true}),
    incident: Args.string({description: 'Incident id (primary)', required: true}),
  }

  static flags = {
    ...projectFlag,
    confirm: Flags.boolean({description: 'Required: confirm the deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MonitorsIncidentsDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm.', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/monitors/${encodeURIComponent(args.monitor)}/incidents/${encodeURIComponent(args.incident)}`,
    )

    if (!this.jsonEnabled()) this.log(`Deleted incident ${args.incident}`)

    return {deleted: args.incident}
  }
}
