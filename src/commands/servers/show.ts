import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class ServersShow extends BaseCommand {
  static args = {
    id: Args.string({description: 'Server id', required: true}),
  }

  static description = 'Show a monitored server (latest snapshot)'

  static examples = ['<%= config.bin %> servers show <server-id>']

  async run(): Promise<unknown> {
    const {args} = await this.parse(ServersShow)
    const res = await this.api.get<Record<string, unknown>>(`/cli/v1/servers/${encodeURIComponent(args.id)}`)

    if (!this.jsonEnabled()) {
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
