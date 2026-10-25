import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class AnalyticsShow extends BaseCommand {
  static description = 'Show the web analytics snapshot for a project (traffic, top pages, goals)'

  static examples = [
    '<%= config.bin %> analytics show --project acme-web',
    '<%= config.bin %> analytics show -p acme-web --range 30d --environment production --json',
  ]

  static flags = {
    ...projectFlag,
    range: Flags.string({description: 'Time range', options: ['24h', '7d', '30d', '1y']}),
    environment: Flags.string({description: 'Filter by environment code'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(AnalyticsShow)
    const projectId = await this.resolveProjectId(flags.project)

    const params = new URLSearchParams()
    if (flags.range !== undefined) params.set('range', flags.range)
    if (flags.environment !== undefined) params.set('environment', flags.environment)
    const query = params.toString()
    const res = await this.api.get<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/analytics${query ? `?${query}` : ''}`,
    )

    if (!this.jsonEnabled()) this.log(renderRecord(res.data ?? {}))

    return res
  }
}
