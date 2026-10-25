import {BaseCommand, pageFlag} from '../../base'
import {renderTable} from '../../lib/output'

export default class UptimeGroupsList extends BaseCommand {
  static description = 'List the uptime monitor groups in your organization'

  static examples = ['<%= config.bin %> uptime-groups list', '<%= config.bin %> uptime-groups list --page 2 --json']

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(UptimeGroupsList)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/uptime_groups?page=${flags.page}`)
    const groups = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['NAME', 'SLUG', 'PUBLIC', 'ID'],
          groups.map((group) => [
            String(group.name ?? ''),
            String(group.slug ?? ''),
            String(group.public_status_enabled ?? false),
            String(group.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
