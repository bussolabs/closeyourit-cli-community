import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class MonitorsResume extends BaseCommand {
  static description = 'Resume a paused uptime monitor (re-enables scheduling)'

  static examples = ['<%= config.bin %> monitors resume <monitor-id> --project acme-api']

  static args = {
    id: Args.string({description: 'Monitor id', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MonitorsResume)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.delete<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/monitors/${encodeURIComponent(args.id)}/pause`,
    )

    if (!this.jsonEnabled()) this.log(`Resumed monitor ${args.id}`)

    return res
  }
}
