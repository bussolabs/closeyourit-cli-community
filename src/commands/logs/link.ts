import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class LogsLink extends BaseCommand {
  static args = {
    id: Args.string({description: 'Log entry id', required: true}),
  }

  static description = 'Manually link a log entry to an error group or a ticket'

  static examples = [
    '<%= config.bin %> logs link <log-entry-id> --to "Errors::Group:<uuid>"',
    '<%= config.bin %> logs link <log-entry-id> --to "Ticketing::Ticket:<uuid>"',
  ]

  static flags = {
    to: Flags.string({
      description: 'Target to link: "Errors::Group:<uuid>" or "Ticketing::Ticket:<uuid>"',
      required: true,
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(LogsLink)
    const res = await this.api.post<Record<string, unknown>>(`/cli/v1/log_entries/${args.id}/links`, {
      linkable: flags.to,
    })

    if (!this.jsonEnabled()) {
      this.log(`Linked log ${args.id} to ${flags.to}:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
