import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class KbDelete extends BaseCommand {
  static description = 'Delete a knowledge page (irreversible)'

  static examples = ['<%= config.bin %> kb delete <page-id> --confirm']

  static args = {
    id: Args.string({description: 'Knowledge page id', required: true}),
  }

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the irreversible deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(KbDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm (the action is irreversible).', {exit: 2})
    }

    await this.api.delete(`/cli/v1/knowledge/pages/${encodeURIComponent(args.id)}`)

    if (!this.jsonEnabled()) this.log(`Deleted knowledge page ${args.id}`)

    return {deleted: args.id}
  }
}
