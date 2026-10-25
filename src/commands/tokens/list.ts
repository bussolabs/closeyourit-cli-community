import {BaseCommand, projectFlag} from '../../base'
import {renderTable, statusCell} from '../../lib/output'

export default class TokensList extends BaseCommand {
  static description = 'List ingest tokens for a project'

  static examples = ['<%= config.bin %> tokens list --project acme-api', '<%= config.bin %> tokens list -p acme-api --json']

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(TokensList)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/projects/${projectId}/tokens`)
    const tokens = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['ID', 'NAME', 'PREFIX', 'STATUS'],
          tokens.map((token) => [
            String(token.id ?? ''),
            String(token.name ?? ''),
            String(token.token_prefix ?? ''),
            statusCell(token.status),
          ]),
        ),
      )
    }

    return res
  }
}
