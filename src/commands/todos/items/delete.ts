import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'

export default class TodosItemsDelete extends BaseCommand {
  static args = {
    listId: Args.string({description: 'Todo list id', required: true}),
    itemId: Args.string({description: 'Todo item id', required: true}),
  }

  static description = 'Delete a todo item (irreversible)'

  static examples = ['<%= config.bin %> todos items delete <list-id> <item-id> --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the irreversible deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TodosItemsDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm (the action is irreversible).', {exit: 2})
    }

    await this.api.delete(`/cli/v1/todo_lists/${args.listId}/items/${args.itemId}`)

    if (!this.jsonEnabled()) this.log(`Deleted todo item ${args.itemId}`)

    return {deleted: args.itemId}
  }
}
