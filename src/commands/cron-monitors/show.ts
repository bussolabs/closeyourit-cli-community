import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class CronMonitorsShow extends BaseCommand {
  static description = 'Show a cron / heartbeat monitor'

  static examples = ['<%= config.bin %> cron-monitors show <monitor-id>']

  static args = {
    id: Args.string({description: 'Cron monitor id', required: true}),
  }

  async run(): Promise<unknown> {
    const {args} = await this.parse(CronMonitorsShow)
    const res = await this.api.get<Record<string, unknown>>(`/cli/v1/cron_monitors/${args.id}`)

    if (!this.jsonEnabled()) this.log(renderRecord(res.data ?? {}))

    return res
  }
}
