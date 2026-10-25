import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TicketsBranch extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static description = 'Create a GitHub branch from a ticket (name prefixed with the ticket code)'

  static examples = [
    '<%= config.bin %> tickets branch DRFL-3 --project driverone-flutter',
    '<%= config.bin %> tickets branch DRFL-3 -p driverone-flutter --json',
  ]

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsBranch)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/github/branch`,
    )

    if (!this.jsonEnabled()) {
      this.log('Branch created:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
