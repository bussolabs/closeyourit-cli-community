import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TicketsPr extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static description = 'Open a GitHub pull request from a ticket (head = the ticket branch, title prefixed with the code)'

  static examples = [
    '<%= config.bin %> tickets pr DRFL-3 --project driverone-flutter',
    '<%= config.bin %> tickets pr DRFL-3 -p driverone-flutter --json',
  ]

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsPr)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/github/pull_request`,
    )

    if (!this.jsonEnabled()) {
      this.log('Pull request opened:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
