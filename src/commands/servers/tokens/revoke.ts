import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'

export default class ServersTokensRevoke extends BaseCommand {
  static args = {
    id: Args.string({description: 'Enrollment token id', required: true}),
  }

  static description = 'Revoke a fleet enrollment token (agents using it stop pushing)'

  static examples = ['<%= config.bin %> servers tokens revoke <token-id> --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the revocation'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ServersTokensRevoke)

    if (!flags.confirm) {
      this.error('Refusing to revoke without --confirm.', {exit: 2})
    }

    await this.api.delete(`/cli/v1/server_tokens/${encodeURIComponent(args.id)}`)

    if (!this.jsonEnabled()) this.log(`Revoked enrollment token ${args.id}`)

    return {revoked: args.id}
  }
}
