import {Args} from '@oclif/core'
import {BaseCommand} from '../../../base'

export default class ServiceAccountsTokensCreate extends BaseCommand {
  static args = {
    account: Args.string({description: 'Service account id', required: true}),
    name: Args.string({description: 'Token name (e.g. ci-deploy)', required: true}),
  }

  static description = 'Create a CLI token (cyi_u_) for a service account (the secret is shown only once)'

  static examples = ['<%= config.bin %> service-accounts tokens create <account-id> ci-deploy']

  async run(): Promise<unknown> {
    const {args} = await this.parse(ServiceAccountsTokensCreate)
    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/service/accounts/${encodeURIComponent(args.account)}/tokens`,
      {name: args.name},
    )
    const token = res.data ?? {}

    if (!this.jsonEnabled()) {
      this.log('Service account token created. Store the secret now — it is shown only once:')
      this.log('')
      this.log(`  secret: ${token.secret ?? '-'}`)
      this.log('')
      this.log('Use it headless: CLOSEYOURIT_TOKEN=<secret> closeyourit secrets bundle -p KEY -e development')
      this.warn('The secret cannot be retrieved again. If you lose it, revoke and create a new one.')
    }

    return res
  }
}
