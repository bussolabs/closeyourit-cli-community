import {BaseCommand, pageFlag} from '../../base'
import {renderTable, statusCell} from '../../lib/output'
import {WORKLOAD_ACTIONS_PATH} from '../../lib/workload'

export default class WorkloadList extends BaseCommand {
  static description = 'List the workload actions of the teams you belong to (newest first)'

  static examples = ['<%= config.bin %> workload list', '<%= config.bin %> workload list --page 2 --json']

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(WorkloadList)
    const res = await this.api.get<Array<Record<string, unknown>>>(`${WORKLOAD_ACTIONS_PATH}?page=${flags.page}`)
    const actions = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['TITLE', 'STATUS', 'TEAM', 'PEOPLE', 'SCHEDULED', 'DUE', 'TICKET', 'ID'],
          actions.map((action) => [
            String(action.title ?? ''),
            statusCell(action.status),
            String(action.team ?? ''),
            String((Array.isArray(action.participants) ? action.participants : []).length),
            String(action.scheduled_at ?? '-'),
            String(action.due_at ?? '-'),
            String(action.ticket_code ?? '-'),
            String(action.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
