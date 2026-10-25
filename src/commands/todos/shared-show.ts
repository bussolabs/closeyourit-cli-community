import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TodosSharedShow extends BaseCommand {
  static args = {
    id: Args.string({description: 'Shared todo list id', required: true}),
  }

  static description = 'Show a todo list shared with you (read-only)'

  static examples = ['<%= config.bin %> todos shared-show <list-id>']

  async run(): Promise<unknown> {
    const {args} = await this.parse(TodosSharedShow)
    const res = await this.api.get<Record<string, unknown>>(`/cli/v1/shared_todo_lists/${args.id}`)

    if (!this.jsonEnabled()) this.log(renderRecord(res.data ?? {}))

    return res
  }
}
