import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TicketsMilestone extends BaseCommand {
  // PUT .../milestone sets; DELETE .../milestone removes. --clear picks the DELETE verb.
  static description = 'Set or clear a ticket milestone (--clear)'

  static examples = [
    '<%= config.bin %> tickets milestone <ticket-id> --project acme-api --milestone-id <milestone-id>',
    '<%= config.bin %> tickets milestone <ticket-id> --project acme-api --clear',
  ]

  static args = {
    id: Args.string({description: 'Ticket id', required: true}),
  }

  static flags = {
    ...projectFlag,
    'milestone-id': Flags.string({description: 'Milestone id (of this project)', exclusive: ['clear']}),
    clear: Flags.boolean({description: 'Remove the current milestone (DELETE)', exclusive: ['milestone-id']}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsMilestone)
    if (!flags.clear && flags['milestone-id'] === undefined) {
      this.error('Provide --milestone-id <id> or --clear.', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    const path = `/cli/v1/projects/${projectId}/tickets/${args.id}/milestone`
    const res = flags.clear
      ? await this.api.delete<Record<string, unknown>>(path)
      : await this.api.put<Record<string, unknown>>(path, {milestone_id: flags['milestone-id']})

    if (!this.jsonEnabled()) {
      this.log(flags.clear ? `Ticket ${args.id} milestone cleared:` : `Ticket ${args.id} milestone set:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
