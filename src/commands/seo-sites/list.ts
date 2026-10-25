import {Flags} from '@oclif/core'
import {BaseCommand, pageFlag} from '../../base'
import {renderTable, statusCell} from '../../lib/output'

type Site = Record<string, unknown> & {
  project?: Record<string, unknown>
  environment?: Record<string, unknown>
}

export default class SeoSitesList extends BaseCommand {
  static description = 'List the sites under SEO check'

  static examples = [
    '<%= config.bin %> seo-sites list',
    '<%= config.bin %> seo-sites list --project acme-site --json',
  ]

  static flags = {
    project: Flags.string({char: 'p', description: 'Filter by project id (UUID) or key'}),
    ...pageFlag,
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(SeoSitesList)

    const query = new URLSearchParams({page: String(flags.page)})
    if (flags.project) query.set('project_id', await this.resolveProjectId(flags.project))

    const res = await this.api.get<Site[]>(`/cli/v1/seo_sites?${query.toString()}`)
    const sites = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['ID', 'PROJECT', 'ENV', 'SITE', 'EVERY', 'OPEN', 'LAST CHECK'],
          sites.map((site) => [
            String(site.id ?? ''),
            String(site.project?.key ?? ''),
            String(site.environment?.code ?? ''),
            String(site.base_url ?? ''),
            String(site.frequency ?? ''),
            String(site.open_issues_count ?? 0),
            // A failed run must never look like a successful one: the reason wins over the date.
            site.last_error ? statusCell(`failed: ${site.last_error}`) : String(site.last_audited_at ?? 'never'),
          ]),
        ),
      )
    }

    return res
  }
}
