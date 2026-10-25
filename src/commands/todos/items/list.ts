import {Args} from '@oclif/core'
import {BaseCommand, pageFlag} from '../../../base'
import {renderTable} from '../../../lib/output'

export default class TodosItemsList extends BaseCommand {
  static args = {
    listId: Args.string({description: 'Todo list id', required: true}),
  }

  static description = 'List the items of one of your todo lists'

  static examples = ['<%= config.bin %> todos items list <list-id>']

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TodosItemsList)
    const res = await this.api.get<Array<Record<string, unknown>>>(
      `/cli/v1/todo_lists/${args.listId}/items?page=${flags.page}`,
    )
    const items = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['TITLE', 'DONE', 'TICKET', 'ID'],
          items.map((item) => [
            String(item.title ?? ''),
            item.done ? 'yes' : 'no',
            String(item.ticket_code ?? '-'),
            String(item.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
