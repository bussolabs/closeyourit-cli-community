import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class MonitorsShow extends BaseCommand {
  static description = 'Show a single uptime monitor'

  static examples = ['<%= config.bin %> monitors show <monitor-id> --project acme-api']

  static args = {
    id: Args.string({description: 'Monitor id', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MonitorsShow)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/monitors/${encodeURIComponent(args.id)}`,
    )

    if (!this.jsonEnabled()) {
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
