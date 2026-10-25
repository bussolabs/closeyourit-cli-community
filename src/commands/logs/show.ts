import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class LogsShow extends BaseCommand {
  static args = {
    id: Args.string({description: 'Log entry id', required: true}),
  }

  static description = 'Show a single log entry (attributes, trace id, correlation)'

  static examples = ['<%= config.bin %> logs show <log-entry-id>']

  async run(): Promise<unknown> {
    const {args} = await this.parse(LogsShow)
    const res = await this.api.get<Record<string, unknown>>(`/cli/v1/log_entries/${args.id}`)

    if (!this.jsonEnabled()) {
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
