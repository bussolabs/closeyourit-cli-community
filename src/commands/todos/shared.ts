import {BaseCommand, pageFlag} from '../../base'
import {renderTable} from '../../lib/output'

export default class TodosShared extends BaseCommand {
  static description = 'List todo lists shared with you (read-only)'

  static examples = ['<%= config.bin %> todos shared', '<%= config.bin %> todos shared --page 2 --json']

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(TodosShared)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/shared_todo_lists?page=${flags.page}`)
    const lists = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['NAME', 'OWNER', 'ITEMS', 'DONE', 'ID'],
          lists.map((list) => [
            String(list.name ?? ''),
            String((list.owner as {name?: string} | undefined)?.name ?? ''),
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
