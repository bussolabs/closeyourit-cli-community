import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class TodosReorder extends BaseCommand {
  static description = 'Reorder your todo lists (pass --list once per id, in the desired order)'

  static examples = ['<%= config.bin %> todos reorder --list <id-a> --list <id-b> --list <id-c>']

  static flags = {
    list: Flags.string({description: 'List id, in order (repeatable)', multiple: true, required: true}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(TodosReorder)
    const res = await this.api.put('/cli/v1/todo_lists/reorder', {ordered_ids: flags.list})

    if (!this.jsonEnabled()) this.log(`Reordered ${flags.list.length} todo lists`)

    return res
  }
}
