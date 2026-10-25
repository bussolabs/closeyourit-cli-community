import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'
import {
  WORKLOAD_ACTIONS_PATH,
  actionFieldFlags,
  applyActionBody,
  participantsLine,
  ticketLinkMissing,
} from '../../lib/workload'

export default class WorkloadCreate extends BaseCommand {
  static description =
    'Create a workload action (non-dev activity: fair, meeting, call…) on one of your teams. Add the people with `workload participant add`.'

  static examples = [
    '<%= config.bin %> workload create --team Marketing --title "Fiera di Rimini"',
    '<%= config.bin %> workload create --team Marketing --title "Riunione firma accordo" --scheduled-at 2026-09-01T09:00:00Z --due-at 2026-09-10T18:00:00Z',
    '<%= config.bin %> workload create --team Marketing --title "Materiale stand" --status in_progress --ticket DRFL-3',
  ]

  static flags = {
    team: Flags.string({
      description: 'Team id (UUID) or name — the action belongs to it and cannot be moved later',
      required: true,
    }),
    title: Flags.string({description: 'What the activity is', required: true}),
    ...actionFieldFlags,
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(WorkloadCreate)
    const teamId = await this.resolveTeamId(flags.team)

    const body: Record<string, unknown> = {team_id: teamId, title: flags.title}
    applyActionBody(body, flags)

    // The human code ("DRFL-3") is resolved here: the server accepts only the id, and one it cannot
    // see is silently dropped instead of rejected.
    const ticketId = flags.ticket ? await this.resolveTicketId(flags.ticket) : undefined
    if (flags.ticket !== undefined) body.ticket_id = ticketId ?? null

    const res = await this.api.post<Record<string, unknown>>(WORKLOAD_ACTIONS_PATH, body)
    const data = res.data ?? {}

    if (ticketLinkMissing(flags.ticket, ticketId, data)) {
      this.warn(`Ticket ${flags.ticket} is not visible to you: the action was created without it.`)
    }

    if (!this.jsonEnabled()) {
      this.log('Workload action created:')
      this.log(renderRecord(data))
      this.log(participantsLine(data))
    }

    return res
  }
}
