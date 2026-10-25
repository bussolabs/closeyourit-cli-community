import {BaseCommand, pageFlag} from '../../../base'
import {renderTable} from '../../../lib/output'

export default class ServersTokensList extends BaseCommand {
  static description = 'List the fleet enrollment tokens (agents authenticate with these)'

  static examples = ['<%= config.bin %> servers tokens list']

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ServersTokensList)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/server_tokens?page=${flags.page}`)
    const tokens = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['NAME', 'PREFIX', 'LAST USED', 'REVOKED', 'ID'],
          tokens.map((token) => [
            String(token.name ?? ''),
            String(token.token_prefix ?? ''),
            String(token.last_used_at ?? '-'),
            String(token.revoked_at ?? '-'),
            String(token.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
