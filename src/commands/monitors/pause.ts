import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class MonitorsPause extends BaseCommand {
  static description = 'Pause an uptime monitor (stops scheduling checks)'

  static examples = ['<%= config.bin %> monitors pause <monitor-id> --project acme-api']

  static args = {
    id: Args.string({description: 'Monitor id', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MonitorsPause)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/monitors/${encodeURIComponent(args.id)}/pause`,
    )

    if (!this.jsonEnabled()) this.log(`Paused monitor ${args.id}`)

    return res
  }
}
