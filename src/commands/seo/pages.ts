import {Flags} from '@oclif/core'
import {BaseCommand, pageFlag} from '../../base'
import {renderTable, statusCell} from '../../lib/output'

type Page = Record<string, unknown> & {project?: Record<string, unknown>}

export default class SeoPages extends BaseCommand {
  static description = 'List the pages the SEO check has visited, with their state'

  static examples = [
    '<%= config.bin %> seo pages',
    '<%= config.bin %> seo pages --project acme-site',
    '<%= config.bin %> seo pages --url /prezzi --json',
  ]

  static flags = {
    project: Flags.string({char: 'p', description: 'Filter by project id (UUID) or key'}),
    url: Flags.string({description: 'Filter by URL (partial match)'}),
    ...pageFlag,
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(SeoPages)

    const query = new URLSearchParams({page: String(flags.page)})
    if (flags.project) query.set('project_id', await this.resolveProjectId(flags.project))
    if (flags.url) query.set('url', flags.url)

    const res = await this.api.get<Page[]>(`/cli/v1/seo/pages?${query.toString()}`)
    const pages = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['PROJECT', 'PATH', 'STATUS', 'TITLE', 'H1', 'WORDS'],
          pages.map((page) => {
            const headings = Array.isArray(page.h1s) ? page.h1s : []
            return [
              String(page.project?.key ?? ''),
              String(page.path ?? page.url ?? ''),
              statusCell(page.status_code),
              String(page.title ?? '—'),
              // No h1 is the finding a green score never reports: it belongs in the column, not hidden.
              headings.length === 0 ? 'missing' : String(headings.length),
              String(page.word_count ?? 0),
            ]
          }),
        ),
      )
    }

    return res
  }
}
