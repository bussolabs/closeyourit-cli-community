import {BaseCommand, projectFlag} from '../../base'
import {Flags} from '@oclif/core'

interface UsageSymbol {
  environment?: string
  kind?: string
  symbol?: string
  first_seen_at?: string
  last_seen_at?: string
  hits_count?: number
}

// CYSK-29 — the symbols SEEN at runtime (the positive set). The "unused" verdict is computed by
// the scanner with the repo's static inventory, never by this command.
export default class UsageList extends BaseCommand {
  static description =
    'List the usage symbols the product reported as actually executed (routes as Controller#action, jobs, custom keys)'

  static examples = [
    '<%= config.bin %> usage list --project CYRA',
    '<%= config.bin %> usage list -p CYRA --kind route --environment production',
    '<%= config.bin %> usage list -p CYRA --json',
  ]

  static flags = {
    ...projectFlag,
    kind: Flags.string({description: 'Only this kind (route, job, custom)'}),
    environment: Flags.string({description: 'Only this environment'}),
    page: Flags.integer({description: 'Page number', default: 1}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(UsageList)
    const projectId = await this.resolveProjectId(flags.project)
    const query = new URLSearchParams({page: String(flags.page)})
    if (flags.kind) query.set('kind', flags.kind)
    if (flags.environment) query.set('environment', flags.environment)
    const res = await this.api.get<UsageSymbol[]>(`/cli/v1/projects/${projectId}/usage?${query.toString()}`)

    if (!this.jsonEnabled()) {
      const rows = res.data ?? []
      if (rows.length === 0) {
        this.log('No usage reported yet: the SDK flushes every ~5 minutes once deployed.')
      } else {
        for (const row of rows) {
          this.log(`${row.kind ?? '?'}  ${row.symbol ?? '?'}  last_seen ${row.last_seen_at ?? '-'}  hits ~${row.hits_count ?? '-'}  (${row.environment ?? '-'})`)
        }
      }
    }

    return res
  }
}
