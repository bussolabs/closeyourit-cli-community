import {Flags} from '@oclif/core'
import {BaseCommand, pageFlag} from '../../base'
import {renderTable, statusCell} from '../../lib/output'

/** The nested objects the issue serializer ships; read defensively (a field may be absent). */
type Issue = Record<string, unknown> & {
  project?: Record<string, unknown>
  site?: Record<string, unknown>
}

export default class SeoList extends BaseCommand {
  static description = 'List the SEO findings of your sites (cross-project)'

  static examples = [
    '<%= config.bin %> seo list',
    '<%= config.bin %> seo list --severity critical',
    '<%= config.bin %> seo list --project acme-site --status open',
    '<%= config.bin %> seo list --area indexability --json',
  ]

  static flags = {
    // Optional here (the endpoint is cross-project): without it, the list spans every visible project.
    project: Flags.string({char: 'p', description: 'Filter by project id (UUID) or key'}),
    severity: Flags.string({description: 'Filter by severity (critical, high, medium, low)'}),
    status: Flags.string({description: 'Filter by status (open, resolved, ignored)'}),
    area: Flags.string({description: 'Filter by area (indexability, structure, content, i18n, performance)'}),
    ...pageFlag,
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(SeoList)

    const query = new URLSearchParams({page: String(flags.page)})
    if (flags.project) query.set('project_id', await this.resolveProjectId(flags.project))
    if (flags.severity) query.set('severity', flags.severity)
    if (flags.status) query.set('status', flags.status)
    if (flags.area) query.set('area', flags.area)

    const res = await this.api.get<Issue[]>(`/cli/v1/seo?${query.toString()}`)
    const issues = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          // ID first, like `vulnerabilities list`: every other subcommand takes it as its argument,
          // so a table without it forces `--json` just to triage what you are already looking at.
          ['ID', 'PROJECT', 'CHECK', 'URL', 'SEVERITY', 'STATUS'],
          issues.map((issue) => [
            String(issue.id ?? ''),
            String(issue.project?.key ?? ''),
            String(issue.check_key ?? ''),
            // A site-wide finding (duplicate titles, unreachable sitemap) has no single URL.
            String(issue.url ?? '— whole site'),
            statusCell(issue.severity),
            statusCell(issue.status),
          ]),
        ),
      )
    }

    return res
  }
}
