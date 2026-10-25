import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TodosComplete extends BaseCommand {
  static args = {
    listId: Args.string({description: 'Todo list id', required: true}),
    itemId: Args.string({description: 'Todo item id', required: true}),
  }

  static description = 'Mark a todo item as done'

  static examples = ['<%= config.bin %> todos complete <list-id> <item-id>']

  async run(): Promise<unknown> {
    const {args} = await this.parse(TodosComplete)
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/todo_lists/${args.listId}/items/${args.itemId}/completion`,
    )

    if (!this.jsonEnabled()) {
      this.log('Todo item completed:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
