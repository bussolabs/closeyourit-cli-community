import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TodosShow extends BaseCommand {
  static args = {
    id: Args.string({description: 'Todo list id', required: true}),
  }

  static description = 'Show one of your todo lists'

  static examples = ['<%= config.bin %> todos show <list-id>']

  async run(): Promise<unknown> {
    const {args} = await this.parse(TodosShow)
    const res = await this.api.get<Record<string, unknown>>(`/cli/v1/todo_lists/${args.id}`)

    if (!this.jsonEnabled()) this.log(renderRecord(res.data ?? {}))

    return res
  }
}
