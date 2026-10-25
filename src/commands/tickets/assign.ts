import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TicketsAssign extends BaseCommand {
  // PUT .../assignee assigns; DELETE .../assignee unassigns. --unassign picks the DELETE verb.
  static description = 'Assign a ticket to an account, or unassign it (--unassign)'

  static examples = [
    '<%= config.bin %> tickets assign <ticket-id> --project acme-api --assignee-id <account-id>',
    '<%= config.bin %> tickets assign <ticket-id> --project acme-api --unassign',
  ]

  static args = {
    id: Args.string({description: 'Ticket id', required: true}),
  }

  static flags = {
    ...projectFlag,
    'assignee-id': Flags.string({description: 'Account id to assign', exclusive: ['unassign']}),
    unassign: Flags.boolean({description: 'Remove the current assignee (DELETE)', exclusive: ['assignee-id']}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsAssign)
    if (!flags.unassign && flags['assignee-id'] === undefined) {
      this.error('Provide --assignee-id <id> or --unassign.', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    const path = `/cli/v1/projects/${projectId}/tickets/${args.id}/assignee`
    const res = flags.unassign
      ? await this.api.delete<Record<string, unknown>>(path)
      : await this.api.put<Record<string, unknown>>(path, {assignee_id: flags['assignee-id']})

    if (!this.jsonEnabled()) {
      this.log(flags.unassign ? `Ticket ${args.id} unassigned:` : `Ticket ${args.id} assigned:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
