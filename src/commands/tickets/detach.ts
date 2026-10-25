import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class TicketsDetach extends BaseCommand {
  static description = 'Remove an attachment from a ticket (irreversible)'

  static examples = [
    '<%= config.bin %> tickets detach <ticket-id> --project acme-api --attachment <attachment-id> --confirm',
  ]

  static args = {
    id: Args.string({description: 'Ticket id', required: true}),
  }

  static flags = {
    ...projectFlag,
    attachment: Flags.string({description: 'Attachment id to remove', required: true}),
    confirm: Flags.boolean({description: 'Required: confirm the irreversible deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsDetach)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm (the action is irreversible).', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/attachments/${encodeURIComponent(flags.attachment)}`,
    )

    if (!this.jsonEnabled()) this.log(`Removed attachment ${flags.attachment} from ticket ${args.id}`)

    return {detached: flags.attachment, ticket: args.id}
  }
}
