import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'
import {renderRecord} from '../../../lib/output'

export default class TodosItemsAdd extends BaseCommand {
  static args = {
    listId: Args.string({description: 'Todo list id', required: true}),
  }

  static description = 'Add an item to a todo list'

  static examples = [
    '<%= config.bin %> todos items add <list-id> --title "Write the changelog"',
    '<%= config.bin %> todos items add <list-id> --title "Fix login" --ticket <ticket-id>',
  ]

  static flags = {
    title: Flags.string({description: 'Item title', required: true}),
    ticket: Flags.string({description: 'Link the item to a ticket id'}),
    position: Flags.integer({description: 'Position in the list'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TodosItemsAdd)

    const body: Record<string, unknown> = {title: flags.title}
    if (flags.ticket !== undefined) body.ticket_id = flags.ticket
    if (flags.position !== undefined) body.position = flags.position

    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/todo_lists/${args.listId}/items`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Todo item added:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
