import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class ServersDelete extends BaseCommand {
  static args = {
    id: Args.string({description: 'Server id', required: true}),
  }

  static description = 'Delete a server and all its metrics (a live agent would re-register it)'

  static examples = ['<%= config.bin %> servers delete <server-id> --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ServersDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm.', {exit: 2})
    }

    await this.api.delete(`/cli/v1/servers/${encodeURIComponent(args.id)}`)

    if (!this.jsonEnabled()) this.log(`Deleted server ${args.id}`)

    return {deleted: args.id}
  }
}
