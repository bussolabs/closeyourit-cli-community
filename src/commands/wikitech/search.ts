import {Args, Flags} from '@oclif/core'
import {BaseCommand, pageFlag, paginationError} from '../../base'
import {truncate} from '../../lib/knowledge'
import {renderTable} from '../../lib/output'

const WIKITECH_VERIFICATIONS = ['verified', 'unconfirmed'] as const

export default class WikitechSearch extends BaseCommand {
  // Variadic query: every positional word is joined into a single search string.
  static strict = false

  static description =
    'Search Wikitech entries (semantic when available, text fallback otherwise); without a query, list them'

  static examples = [
    '<%= config.bin %> wikitech search python package manager',
    '<%= config.bin %> wikitech search --category python --verification verified',
    '<%= config.bin %> wikitech search vector database --per 10 --json',
  ]

  static args = {
    query: Args.string({description: 'Search query (all positional words are joined)'}),
  }

  static flags = {
    category: Flags.string({description: 'Filter by category'}),
    verification: Flags.string({description: 'Filter by verification state', options: [...WIKITECH_VERIFICATIONS]}),
    per: Flags.integer({description: 'Page size'}),
    ...pageFlag,
  }

  async run(): Promise<unknown> {
    const {argv, flags} = await this.parse(WikitechSearch)
    const invalid = paginationError(flags)
    if (invalid) this.error(invalid, {exit: 2})

    const q = (argv as string[]).join(' ').trim()
    const query = new URLSearchParams({page: String(flags.page)})
    if (flags.per !== undefined) query.set('per', String(flags.per))
    if (q !== '') query.set('q', q)
    if (flags.category) query.set('category', flags.category)
    if (flags.verification) query.set('verification', flags.verification)

    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/wikitech/entries?${query.toString()}`)
    const entries = res.data ?? []

    if (!this.jsonEnabled()) {
      if (res.meta?.search === 'like') this.log('(semantic search unavailable — showing text matches)')

      this.log(
        renderTable(
          ['NAME', 'SUMMARY', 'CATEGORIES', 'VERIFICATION', 'SOURCES', 'ID'],
          entries.map((entry) => [
            String(entry.name ?? ''),
            truncate(String(entry.summary ?? '')),
            Array.isArray(entry.categories) ? entry.categories.join(', ') : '',
            String(entry.verification ?? ''),
            String(entry.sources_count ?? ''),
            String(entry.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
