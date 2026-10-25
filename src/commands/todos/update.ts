import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TodosUpdate extends BaseCommand {
  static args = {
    id: Args.string({description: 'Todo list id', required: true}),
  }

  static description = 'Update a todo list (rename or recolor)'

  static examples = [
    '<%= config.bin %> todos update <list-id> --name "Sprint prep"',
    '<%= config.bin %> todos update <list-id> --color rose',
  ]

  static flags = {
    name: Flags.string({description: 'New name'}),
    color: Flags.string({description: 'Color label'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TodosUpdate)

    const body: Record<string, unknown> = {}
    if (flags.name !== undefined) body.name = flags.name
    if (flags.color !== undefined) body.color = flags.color

    const res = await this.api.put<Record<string, unknown>>(`/cli/v1/todo_lists/${args.id}`, body)

    if (!this.jsonEnabled()) {
      this.log('Todo list updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
