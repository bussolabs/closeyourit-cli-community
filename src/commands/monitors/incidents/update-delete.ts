import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'

export default class MonitorsIncidentsUpdateDelete extends BaseCommand {
  static description = 'Delete a timeline step from a narrated incident (irreversible)'

  static examples = [
    '<%= config.bin %> monitors incidents update-delete <monitor-id> <incident-id> <update-id> --project acme-api --confirm',
  ]

  static args = {
    monitor: Args.string({description: 'Monitor id', required: true}),
    incident: Args.string({description: 'Incident id (primary)', required: true}),
    update: Args.string({description: 'Timeline step id', required: true}),
  }

  static flags = {
    ...projectFlag,
    confirm: Flags.boolean({description: 'Required: confirm the deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MonitorsIncidentsUpdateDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm.', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/monitors/${encodeURIComponent(args.monitor)}/incidents/${encodeURIComponent(args.incident)}/updates/${encodeURIComponent(args.update)}`,
    )

    if (!this.jsonEnabled()) this.log(`Deleted incident update ${args.update}`)

    return {deleted: args.update}
  }
}
