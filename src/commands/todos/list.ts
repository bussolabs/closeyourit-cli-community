import {BaseCommand, pageFlag} from '../../base'
import {renderTable} from '../../lib/output'

export default class TodosList extends BaseCommand {
  static description = 'List your own todo lists'

  static examples = ['<%= config.bin %> todos list', '<%= config.bin %> todos list --page 2 --json']

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(TodosList)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/todo_lists?page=${flags.page}`)
    const lists = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['NAME', 'ITEMS', 'DONE', 'ID'],
          lists.map((list) => [
            String(list.name ?? ''),
            String(list.items_count ?? 0),
            String(list.done_count ?? 0),
            String(list.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
