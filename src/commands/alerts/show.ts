import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class AlertsShow extends BaseCommand {
  static args = {
    id: Args.string({description: 'Alert rule id', required: true}),
  }

  static description = 'Show a single alert rule'

  static examples = ['<%= config.bin %> alerts show <rule-id>']

  async run(): Promise<unknown> {
    const {args} = await this.parse(AlertsShow)
    const res = await this.api.get<Record<string, unknown>>(`/cli/v1/alert_rules/${encodeURIComponent(args.id)}`)

    if (!this.jsonEnabled()) {
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
