import {BaseCommand} from '../../base'
import {renderTable, statusCell} from '../../lib/output'

export default class TicketsStatuses extends BaseCommand {
  static description =
    'List the organization ticket statuses (id, code, label) — the id feeds `tickets create --status-id`'

  static examples = ['<%= config.bin %> tickets statuses', '<%= config.bin %> tickets statuses --json']

  async run(): Promise<unknown> {
    await this.parse(TicketsStatuses)
    // Org-level lookup (not project-scoped): the ids are valid for a ticket in any project.
    const res = await this.api.get<Array<Record<string, unknown>>>('/cli/v1/types/ticket_statuses')
    const statuses = res.data

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['ID', 'CODE', 'LABEL'],
          statuses.map((status) => [
            String(status.id ?? ''),
            String(status.code ?? ''),
            statusCell(status.label, typeof status.color === 'string' ? status.color : undefined),
          ]),
        ),
      )
    }

    return res
  }
}
