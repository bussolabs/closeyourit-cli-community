import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderTable} from '../../lib/output'

export default class TodosShares extends BaseCommand {
  static args = {
    listId: Args.string({description: 'Todo list id', required: true}),
  }

  static description = 'List the members a todo list is shared with (read-only)'

  static examples = ['<%= config.bin %> todos shares <list-id>']

  async run(): Promise<unknown> {
    const {args} = await this.parse(TodosShares)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/todo_lists/${args.listId}/sharing`)
    const recipients = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['NAME', 'HANDLE', 'ID'],
          recipients.map((account) => [
            String(account.name ?? ''),
            String(account.handle ?? ''),
            String(account.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
