import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'
import {renderRecord} from '../../../lib/output'

export default class TodosItemsUpdate extends BaseCommand {
  static args = {
    listId: Args.string({description: 'Todo list id', required: true}),
    itemId: Args.string({description: 'Todo item id', required: true}),
  }

  static description = 'Update a todo item (retitle, relink a ticket, or reposition)'

  static examples = [
    '<%= config.bin %> todos items update <list-id> <item-id> --title "New title"',
    '<%= config.bin %> todos items update <list-id> <item-id> --ticket <ticket-id>',
  ]

  static flags = {
    title: Flags.string({description: 'New title'}),
    ticket: Flags.string({description: 'Link the item to a ticket id'}),
    position: Flags.integer({description: 'Position in the list'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TodosItemsUpdate)

    const body: Record<string, unknown> = {}
    if (flags.title !== undefined) body.title = flags.title
    if (flags.ticket !== undefined) body.ticket_id = flags.ticket
    if (flags.position !== undefined) body.position = flags.position

    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/todo_lists/${args.listId}/items/${args.itemId}`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Todo item updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
