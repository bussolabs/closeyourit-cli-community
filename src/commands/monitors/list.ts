import {BaseCommand, pageFlag, projectFlag} from '../../base'
import {renderTable, statusCell} from '../../lib/output'

export default class MonitorsList extends BaseCommand {
  static description = 'List the uptime monitors for a project'

  static examples = [
    '<%= config.bin %> monitors list --project acme-api',
    '<%= config.bin %> monitors list -p acme-api --json',
  ]

  static flags = {...projectFlag, ...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(MonitorsList)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Array<Record<string, unknown>>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/monitors?page=${flags.page}`,
    )
    const monitors = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['NAME', 'URL', 'STATUS', 'ACTIVE', 'ID'],
          monitors.map((monitor) => [
            String(monitor.name ?? ''),
            String(monitor.url ?? ''),
            statusCell(monitor.current_status),
            String(monitor.active ?? ''),
            String(monitor.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
