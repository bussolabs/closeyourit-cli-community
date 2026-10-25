import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'
import {
  WORKLOAD_ACTIONS_PATH,
  actionFieldFlags,
  applyActionBody,
  participantsLine,
  ticketLinkMissing,
} from '../../lib/workload'

export default class WorkloadUpdate extends BaseCommand {
  static args = {
    id: Args.string({description: 'Workload action id', required: true}),
  }

  static description =
    'Update a workload action (only the passed fields change). The team never changes: moving an action would change who can see it.'

  static examples = [
    '<%= config.bin %> workload update <action-id> --status done',
    '<%= config.bin %> workload update <action-id> --title "Fiera 2027" --due-at 2027-09-10T18:00:00Z',
    '<%= config.bin %> workload update <action-id> --ticket ""',
  ]

  static flags = {
    title: Flags.string({description: 'New title'}),
    ...actionFieldFlags,
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(WorkloadUpdate)

    const body: Record<string, unknown> = {}
    if (flags.title !== undefined) body.title = flags.title
    applyActionBody(body, flags)

    const ticketId = flags.ticket ? await this.resolveTicketId(flags.ticket) : undefined
    if (flags.ticket !== undefined) body.ticket_id = ticketId ?? null

    const res = await this.api.put<Record<string, unknown>>(
      `${WORKLOAD_ACTIONS_PATH}/${encodeURIComponent(args.id)}`,
      body,
    )
    const data = res.data ?? {}

    // On an update the server's silent rejection does not leave things as they were: it clears the
    // field, so it also takes away the ticket that was linked before. Say it in full.
    if (ticketLinkMissing(flags.ticket, ticketId, data)) {
      this.warn(
        `Ticket ${flags.ticket} is not visible to you: the action now has no linked ticket at all, not even the one it had before.`,
      )
    }

    if (!this.jsonEnabled()) {
      this.log('Workload action updated:')
      this.log(renderRecord(data))
      this.log(participantsLine(data))
    }

    return res
  }
}
