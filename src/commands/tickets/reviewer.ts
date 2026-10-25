import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TicketsReviewer extends BaseCommand {
  // Set the reviewer of a ticket (the backend gates `tickets.assign`). The reviewer is pinged only when
  // the ticket enters a review-gate status (backend). To remove the reviewer: tickets unreviewer.
  static description = 'Set the reviewer of a ticket (requires tickets.assign)'

  static examples = ['<%= config.bin %> tickets reviewer <ticket-id> --project acme-api --reviewer-id <account-id>']

  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static flags = {
    ...projectFlag,
    'reviewer-id': Flags.string({description: 'Account id to set as reviewer', required: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsReviewer)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/tickets/${args.id}/reviewer`,
      {reviewer_id: flags['reviewer-id']},
    )

    if (!this.jsonEnabled()) {
      this.log(`Ticket ${args.id} reviewer set:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
