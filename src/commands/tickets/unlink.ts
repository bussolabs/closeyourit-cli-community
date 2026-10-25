import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class TicketsUnlink extends BaseCommand {
  // Remove a ticket↔ticket link (the backend gates `tickets.edit`). Irreversible → requires --confirm.
  static description = 'Remove a ticket-to-ticket link (irreversible; requires tickets.edit)'

  static examples = ['<%= config.bin %> tickets unlink <ticket-id> <link-id> --project acme-api --confirm']

  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
    linkId: Args.string({description: 'Link id to remove', required: true}),
  }

  static flags = {
    ...projectFlag,
    confirm: Flags.boolean({description: 'Required: confirm the irreversible removal'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsUnlink)

    if (!flags.confirm) {
      this.error('Refusing to remove without --confirm (the action is irreversible).', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(`/cli/v1/projects/${projectId}/tickets/${args.id}/links/${args.linkId}`)

    if (!this.jsonEnabled()) this.log(`Removed link ${args.linkId} from ticket ${args.id}`)

    return {removed: args.linkId}
  }
}
