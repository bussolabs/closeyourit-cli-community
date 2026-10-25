import {Flags} from '@oclif/core'
import {BaseCommand, pageFlag} from '../../base'
import {renderTable, statusCell} from '../../lib/output'

export default class CronMonitorsList extends BaseCommand {
  static description = 'List cron / heartbeat monitors across your visible projects'

  static examples = [
    '<%= config.bin %> cron-monitors list',
    '<%= config.bin %> cron-monitors list --status missed --project acme-api --json',
  ]

  static flags = {
    ...pageFlag,
    project: Flags.string({char: 'p', description: 'Filter by project id (UUID) or key'}),
    status: Flags.string({description: 'Filter by status', options: ['unknown', 'ok', 'late', 'missed']}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(CronMonitorsList)

    const params = new URLSearchParams({page: String(flags.page)})
    if (flags.status !== undefined) params.set('status', flags.status)
    if (flags.project !== undefined) params.set('project_id', await this.resolveProjectId(flags.project))

    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/cron_monitors?${params.toString()}`)
    const monitors = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['NAME', 'STATUS', 'INTERVAL (min)', 'LAST CHECK-IN', 'ID'],
          monitors.map((monitor) => [
            String(monitor.name ?? ''),
            statusCell(monitor.status),
            String(monitor.expected_interval_minutes ?? '-'),
            String(monitor.last_check_in_at ?? '-'),
            String(monitor.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
