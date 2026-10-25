import {Flags} from '@oclif/core'
import {BaseCommand, pageFlag, projectFlag} from '../../base'
import {renderTable, statusCell} from '../../lib/output'

export default class ErrorsList extends BaseCommand {
  static description = 'List error groups for a project'

  static examples = [
    '<%= config.bin %> errors list --project acme-api',
    '<%= config.bin %> errors list -p acme-api --status unresolved --json',
  ]

  static flags = {
    ...projectFlag,
    ...pageFlag,
    status: Flags.string({description: 'Filter by status (e.g. unresolved, resolved, muted)'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ErrorsList)
    const projectId = await this.resolveProjectId(flags.project)

    const query = new URLSearchParams({page: String(flags.page)})
    if (flags.status) query.set('status', flags.status)

    const res = await this.api.get<Array<Record<string, unknown>>>(
      `/cli/v1/projects/${projectId}/error_groups?${query.toString()}`,
    )
    const groups = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['ID', 'TITLE', 'STATUS', 'EVENTS'],
          groups.map((group) => [
            String(group.id ?? ''),
            String(group.title ?? ''),
            statusCell(group.status),
            String(group.events_count ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
