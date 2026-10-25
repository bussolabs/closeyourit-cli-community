import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TodosUncomplete extends BaseCommand {
  static args = {
    listId: Args.string({description: 'Todo list id', required: true}),
    itemId: Args.string({description: 'Todo item id', required: true}),
  }

  static description = 'Reopen a todo item (mark it not done)'

  static examples = ['<%= config.bin %> todos uncomplete <list-id> <item-id>']

  async run(): Promise<unknown> {
    const {args} = await this.parse(TodosUncomplete)
    const res = await this.api.delete<Record<string, unknown>>(
      `/cli/v1/todo_lists/${args.listId}/items/${args.itemId}/completion`,
    )

    if (!this.jsonEnabled()) {
      this.log('Todo item reopened:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
