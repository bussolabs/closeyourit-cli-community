import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderTable} from '../../lib/output'

export default class TodosShare extends BaseCommand {
  static args = {
    listId: Args.string({description: 'Todo list id', required: true}),
  }

  static description = 'Set who a todo list is shared with (replaces the set; omit --account to unshare all)'

  static examples = [
    '<%= config.bin %> todos share <list-id> --account <account-id> --account <account-id>',
    '<%= config.bin %> todos share <list-id>',
  ]

  static flags = {
    account: Flags.string({description: 'Recipient account id (repeatable)', multiple: true, default: []}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TodosShare)
    const res = await this.api.put<Array<Record<string, unknown>>>(
      `/cli/v1/todo_lists/${args.listId}/sharing`,
      {account_ids: flags.account},
    )
    const recipients = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(`Todo list shared with ${recipients.length} members`)
      this.log(
        renderTable(
          ['NAME', 'HANDLE', 'ID'],
          recipients.map((account) => [
            String(account.name ?? ''),
            String(account.handle ?? ''),
            String(account.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
