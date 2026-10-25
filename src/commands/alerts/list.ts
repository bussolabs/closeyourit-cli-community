import {BaseCommand, pageFlag} from '../../base'
import {renderTable} from '../../lib/output'

export default class AlertsList extends BaseCommand {
  static description = 'List the alert rules in your organization'

  static examples = ['<%= config.bin %> alerts list', '<%= config.bin %> alerts list --page 2 --json']

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(AlertsList)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/alert_rules?page=${flags.page}`)
    const rules = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['NAME', 'TYPE', 'ENABLED', 'ID'],
          rules.map((rule) => [
            String(rule.name ?? ''),
            String(rule.event_type ?? ''),
            String(rule.enabled ?? ''),
            String(rule.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
