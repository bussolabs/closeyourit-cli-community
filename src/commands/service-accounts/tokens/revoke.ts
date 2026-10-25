import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'

export default class ServiceAccountsTokensRevoke extends BaseCommand {
  static args = {
    account: Args.string({description: 'Service account id', required: true}),
    id: Args.string({description: 'Token id', required: true}),
  }

  static description = 'Revoke a service account CLI token (the agent using it loses access)'

  static examples = ['<%= config.bin %> service-accounts tokens revoke <account-id> <token-id> --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the revocation'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ServiceAccountsTokensRevoke)

    if (!flags.confirm) {
      this.error('Refusing to revoke without --confirm.', {exit: 2})
    }

    await this.api.delete(
      `/cli/v1/service/accounts/${encodeURIComponent(args.account)}/tokens/${encodeURIComponent(args.id)}`,
    )

    if (!this.jsonEnabled()) this.log(`Revoked token ${args.id}`)

    return {revoked: args.id}
  }
}
