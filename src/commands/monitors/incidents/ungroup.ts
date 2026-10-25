import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'

export default class MonitorsIncidentsUngroup extends BaseCommand {
  static description = 'Dissolve an incident grouping (grouped windows become separate again)'

  static examples = [
    '<%= config.bin %> monitors incidents ungroup <monitor-id> <incident-id> --project acme-api',
    '<%= config.bin %> monitors incidents ungroup <monitor-id> <incident-id> -p acme-api --keep <window-id>',
  ]

  static args = {
    monitor: Args.string({description: 'Monitor id', required: true}),
    incident: Args.string({description: 'Incident id (primary)', required: true}),
  }

  static flags = {
    ...projectFlag,
    keep: Flags.string({description: 'Id of the window that keeps the narration status'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MonitorsIncidentsUngroup)
    const projectId = await this.resolveProjectId(flags.project)

    const body: Record<string, unknown> = {}
    if (flags.keep !== undefined) body.keep_incident_id = flags.keep

    await this.api.delete(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/monitors/${encodeURIComponent(args.monitor)}/incidents/${encodeURIComponent(args.incident)}/group`,
      {body},
    )

    if (!this.jsonEnabled()) this.log(`Ungrouped incident ${args.incident}`)

    return {ungrouped: args.incident}
  }
}
