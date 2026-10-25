import {Flags} from '@oclif/core'
import {BaseCommand, pageFlag, projectFlag} from '../../base'
import {renderTable} from '../../lib/output'

export default class MetricsList extends BaseCommand {
  static description = 'List performance metric groups (slow queries/methods) for a project'

  static examples = [
    '<%= config.bin %> metrics list --project acme-api',
    '<%= config.bin %> metrics list -p acme-api --kind sql --json',
  ]

  static flags = {
    ...projectFlag,
    ...pageFlag,
    kind: Flags.string({description: 'Filter by metric kind (e.g. sql, method)'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(MetricsList)
    const projectId = await this.resolveProjectId(flags.project)

    const query = new URLSearchParams({page: String(flags.page)})
    if (flags.kind) query.set('kind', flags.kind)

    const res = await this.api.get<Array<Record<string, unknown>>>(
      `/cli/v1/projects/${projectId}/metric_groups?${query.toString()}`,
    )
    const groups = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['ID', 'KIND', 'NAME', 'COUNT'],
          groups.map((group) => [
            String(group.id ?? ''),
            String(group.kind ?? ''),
            String(group.name ?? group.title ?? ''),
            String(group.samples_count ?? group.count ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
