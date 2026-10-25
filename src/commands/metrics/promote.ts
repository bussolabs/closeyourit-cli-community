import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class MetricsPromote extends BaseCommand {
  static description = 'Promote a metric group (slow query/method) to a ticket'

  static examples = ['<%= config.bin %> metrics promote <group-id> --project acme-api']

  static args = {
    id: Args.string({description: 'Metric group id', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MetricsPromote)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/metric_groups/${args.id}/promotion`,
    )

    if (!this.jsonEnabled()) {
      this.log('Ticket created:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
