import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class MetricsShow extends BaseCommand {
  static description = 'Show a single metric group'

  static examples = ['<%= config.bin %> metrics show <group-id> --project acme-api']

  static args = {
    id: Args.string({description: 'Metric group id', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MetricsShow)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/metric_groups/${args.id}`,
    )

    if (!this.jsonEnabled()) {
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
