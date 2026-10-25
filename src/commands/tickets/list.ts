import {Flags} from '@oclif/core'
import {BaseCommand, pageFlag, projectFlag} from '../../base'
import {renderTable, statusCell} from '../../lib/output'

// Agent-eligibility gate: a ticket reaches the autonomous agents only when it is `allowed`.
// Rendered short so the column stays scannable next to CODE.
const AGENTS_MARK: Record<string, string> = {
  allowed: 'yes',
  blocked: 'no',
  pending: '?',
}

export default class TicketsList extends BaseCommand {
  static description = 'List tickets for a project'

  static examples = [
    '<%= config.bin %> tickets list --project acme-api',
    '<%= config.bin %> tickets list -p acme-api --agent-eligibility pending',
    '<%= config.bin %> tickets list -p acme-api --assignee me --open',
    '<%= config.bin %> tickets list -p acme-api --json',
  ]

  static flags = {
    ...projectFlag,
    ...pageFlag,
    'agent-eligibility': Flags.string({
      description: 'Filter by agent eligibility',
      options: ['pending', 'allowed', 'blocked'],
    }),
    assignee: Flags.string({
      description: 'Only the tickets assigned to you',
      options: ['me'],
    }),
    open: Flags.boolean({
      description: 'Leave out the tickets whose status is done',
    }),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(TicketsList)
    const projectId = await this.resolveProjectId(flags.project)
    const query = new URLSearchParams({page: String(flags.page)})
    if (flags['agent-eligibility']) query.set('agent_eligibility', flags['agent-eligibility'])
    if (flags.assignee) query.set('assignee', flags.assignee)
    if (flags.open) query.set('open', 'true')
    const res = await this.api.get<Array<Record<string, unknown>>>(
      `/cli/v1/projects/${projectId}/tickets?${query.toString()}`,
    )
    const tickets = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['CODE', 'TITLE', 'STATUS', 'AGENTS'],
          tickets.map((ticket) => [
            String(ticket.code ?? ''),
            String(ticket.title ?? ''),
            statusCell(ticket.status, typeof ticket.status_color === 'string' ? ticket.status_color : undefined),
            AGENTS_MARK[String(ticket.agent_eligibility ?? '')] ?? '',
          ]),
        ),
      )
    }

    return res
  }
}
