import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class TodosDelete extends BaseCommand {
  static args = {
    id: Args.string({description: 'Todo list id', required: true}),
  }

  static description = 'Delete a todo list (irreversible)'

  static examples = ['<%= config.bin %> todos delete <list-id> --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the irreversible deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TodosDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm (the action is irreversible).', {exit: 2})
    }

    await this.api.delete(`/cli/v1/todo_lists/${args.id}`)

    if (!this.jsonEnabled()) this.log(`Deleted todo list ${args.id}`)

    return {deleted: args.id}
  }
}
