import {Flags} from '@oclif/core'
import {BaseCommand, pageFlag} from '../../base'
import {renderTable, statusCell} from '../../lib/output'

export default class ServersList extends BaseCommand {
  static description = 'List the monitored servers in your organization (fleet snapshot)'

  static examples = [
    '<%= config.bin %> servers list',
    '<%= config.bin %> servers list --status down --json',
  ]

  static flags = {
    ...pageFlag,
    status: Flags.string({
      description: 'Filter by status (repeatable)',
      multiple: true,
      options: ['pending', 'up', 'down', 'paused'],
    }),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ServersList)
    const params = new URLSearchParams({page: String(flags.page)})
    for (const status of flags.status ?? []) params.append('status[]', status)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/servers?${params.toString()}`)
    const hosts = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['NAME', 'STATUS', 'CPU%', 'MEM%', 'DISK%', 'LAST SEEN', 'ID'],
          hosts.map((host) => [
            String(host.name ?? ''),
            statusCell(host.status),
            String(host.cpu_pct ?? '-'),
            String(host.mem_pct ?? '-'),
            String(host.disk_pct ?? '-'),
            String(host.last_seen_at ?? '-'),
            String(host.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
