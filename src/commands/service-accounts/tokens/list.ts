import {Args} from '@oclif/core'
import {BaseCommand, pageFlag, paginationError} from '../../../base'
import {renderTable, statusCell} from '../../../lib/output'
import {tokenStatus, withoutSecret} from '../../../lib/service-accounts'

export default class ServiceAccountsTokensList extends BaseCommand {
  static args = {
    account: Args.string({description: 'Service account id', required: true}),
  }

  static description =
    'List the CLI tokens of a service account — which ones still work and which are revoked. Never the secret.'

  static examples = [
    '<%= config.bin %> service-accounts tokens list <account-id>',
    '<%= config.bin %> service-accounts tokens list <account-id> --json',
  ]

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ServiceAccountsTokensList)
    // The backend clamps a page below 1 back to page 1 without a word, so a script that computed the
    // wrong number would get plausible rows instead of an error.
    const invalid = paginationError(flags)
    if (invalid) this.error(invalid, {exit: 2})

    const res = await this.api.get<Array<Record<string, unknown>>>(
      `/cli/v1/service/accounts/${encodeURIComponent(args.account)}/tokens?page=${flags.page}`,
    )
    // Stripped on both paths: a listing tells you which tokens exist, never what they are.
    const tokens = (res.data ?? []).map((token) => withoutSecret(token))

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['ID', 'NAME', 'PREFIX', 'STATUS', 'LAST USED', 'REVOKED AT'],
          tokens.map((token) => [
            String(token.id ?? ''),
            String(token.name ?? ''),
            String(token.token_prefix ?? ''),
            statusCell(tokenStatus(token)),
            String(token.last_used_at ?? '-'),
            String(token.revoked_at ?? '-'),
          ]),
        ),
      )
    }

    return {...res, data: tokens}
  }
}
