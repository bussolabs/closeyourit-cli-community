import {BaseCommand} from '../../base'
import {renderTable, statusCell} from '../../lib/output'

export default class TicketsPriorities extends BaseCommand {
  static description =
    'List the organization ticket priorities (id, code, label) — the id feeds `tickets create --priority-id`'

  static examples = ['<%= config.bin %> tickets priorities', '<%= config.bin %> tickets priorities --json']

  async run(): Promise<unknown> {
    await this.parse(TicketsPriorities)
    // Org-level lookup (not project-scoped): the ids are valid for a ticket in any project.
    const res = await this.api.get<Array<Record<string, unknown>>>('/cli/v1/types/ticket_priorities')
    const priorities = res.data

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['ID', 'CODE', 'LABEL'],
          priorities.map((priority) => [
            String(priority.id ?? ''),
            String(priority.code ?? ''),
            statusCell(priority.label, typeof priority.color === 'string' ? priority.color : undefined),
          ]),
        ),
      )
    }

    return res
  }
}
