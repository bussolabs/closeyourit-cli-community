import {BaseCommand, pageFlag} from '../../base'
import {renderTable} from '../../lib/output'

export default class ServiceAccountsList extends BaseCommand {
  static description = 'List the service accounts (AI members, CLI-only) in your organization'

  static examples = ['<%= config.bin %> service-accounts list', '<%= config.bin %> service-accounts list --json']

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ServiceAccountsList)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/service/accounts?page=${flags.page}`)
    const accounts = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['NAME', 'HANDLE', 'SECRET ENVS', 'TOKENS', 'ID'],
          accounts.map((account) => [
            String(account.name ?? ''),
            String(account.handle ?? ''),
            ((account.secret_environment_codes as string[]) ?? []).join(',') || 'all',
            String(account.active_tokens_count ?? 0),
            String(account.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
