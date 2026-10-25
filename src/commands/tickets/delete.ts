import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class TicketsDelete extends BaseCommand {
  static description = 'Delete a ticket (irreversible)'

  static examples = ['<%= config.bin %> tickets delete <ticket-id> --project acme-api --confirm']

  static args = {
    id: Args.string({description: 'Ticket id', required: true}),
  }

  static flags = {
    ...projectFlag,
    confirm: Flags.boolean({description: 'Required: confirm the irreversible deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm (the action is irreversible).', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(`/cli/v1/projects/${projectId}/tickets/${args.id}`)

    if (!this.jsonEnabled()) this.log(`Deleted ticket ${args.id}`)

    return {deleted: args.id}
  }
}
