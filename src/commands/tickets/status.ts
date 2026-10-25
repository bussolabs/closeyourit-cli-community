import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'
import {TICKET_STATUS} from '../../lib/ticket-lookup'

export default class TicketsStatus extends BaseCommand {
  static description = 'Change a ticket status (by code, label or id)'

  static examples = [
    '<%= config.bin %> tickets status <ticket-id> --project acme-api --status in_review',
    '<%= config.bin %> tickets status <ticket-id> --project acme-api --status <status-id>',
  ]

  static args = {
    id: Args.string({description: 'Ticket id', required: true}),
  }

  static flags = {
    ...projectFlag,
    // The status is written as it is read: `--status-id` stays as an alias for scripts (CYCL-34).
    status: Flags.string({
      aliases: ['status-id'],
      description: 'Target status code, label or id (e.g. in_review, "In Review")',
      required: true,
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsStatus)
    const projectId = await this.resolveProjectId(flags.project)
    const statusId = await this.resolveTicketLookupId(TICKET_STATUS, flags.status)
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/tickets/${args.id}/status`,
      {status_id: statusId},
    )

    if (!this.jsonEnabled()) {
      this.log(`Ticket ${args.id} status updated:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
