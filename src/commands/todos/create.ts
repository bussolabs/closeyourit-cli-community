import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TodosCreate extends BaseCommand {
  static description = 'Create a todo list'

  static examples = [
    '<%= config.bin %> todos create --name "Sprint prep"',
    '<%= config.bin %> todos create --name "Sprint prep" --color indigo',
  ]

  static flags = {
    name: Flags.string({description: 'List name', required: true}),
    color: Flags.string({description: 'Color label'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(TodosCreate)

    const body: Record<string, unknown> = {name: flags.name}
    if (flags.color !== undefined) body.color = flags.color

    const res = await this.api.post<Record<string, unknown>>('/cli/v1/todo_lists', body)

    if (!this.jsonEnabled()) {
      this.log('Todo list created:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
