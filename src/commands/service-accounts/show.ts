import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'
import {accountSummary, environmentsLine, withoutSecret} from '../../lib/service-accounts'

export default class ServiceAccountsShow extends BaseCommand {
  static args = {
    id: Args.string({description: 'Service account id', required: true}),
  }

  static description =
    'Show a service account: identity, how many tokens are active, and the environments it can read secrets in'

  static examples = ['<%= config.bin %> service-accounts show <id>', '<%= config.bin %> service-accounts show <id> --json']

  async run(): Promise<unknown> {
    const {args} = await this.parse(ServiceAccountsShow)
    const res = await this.api.get<Record<string, unknown>>(
      `/cli/v1/service/accounts/${encodeURIComponent(args.id)}`,
    )

    const account = withoutSecret(res.data ?? {})

    if (!this.jsonEnabled()) {
      this.log(renderRecord(accountSummary(account)))
      this.log(environmentsLine(account.secret_environment_codes))
    }

    // Stripped on the machine path too, not just on screen: the human branch prints an allow-list of
    // fields, so leaving `--json` on the raw payload would make the quieter output the leakier one.
    return {...res, data: account}
  }
}
