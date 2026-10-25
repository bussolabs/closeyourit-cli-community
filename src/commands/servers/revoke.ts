import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class ServersRevoke extends BaseCommand {
  static args = {
    id: Args.string({description: 'Server id', required: true}),
  }

  static description = 'Revoke a server: its agent gets 403 and stops (host stays, reversible)'

  static examples = ['<%= config.bin %> servers revoke <server-id> --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the revocation'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ServersRevoke)

    if (!flags.confirm) {
      this.error('Refusing to revoke without --confirm.', {exit: 2})
    }

    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/servers/${encodeURIComponent(args.id)}/revoke`,
    )

    if (!this.jsonEnabled()) this.log(`Revoked server ${args.id} — its agent now receives 403.`)

    return res
  }
}
