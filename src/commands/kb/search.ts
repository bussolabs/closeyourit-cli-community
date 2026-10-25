import {Args, Flags} from '@oclif/core'
import {BaseCommand, pageFlag} from '../../base'
import {
  KNOWLEDGE_STATUSES,
  RelatedRow,
  buildPagesQuery,
  normalizeKinds,
  renderPagesTable,
  renderRelatedGroups,
} from '../../lib/knowledge'

export default class KbSearch extends BaseCommand {
  // Variadic query: every positional word is joined into a single search string.
  static strict = false

  static description =
    'Search knowledge pages (semantic when available, ILIKE fallback on the title otherwise)'

  static examples = [
    '<%= config.bin %> kb search kamal deploy rollback',
    '<%= config.bin %> kb search "connection pool timeout" --project acme-api',
    '<%= config.bin %> kb search kamal rollback --with-related',
    '<%= config.bin %> kb search retry backoff --kind decision --json',
    '<%= config.bin %> kb search cache in prova --status all',
  ]

  // Non-required: with strict = false the arg validation is off, so we guard the empty case ourselves.
  static args = {
    query: Args.string({description: 'Search query (all positional words are joined)'}),
  }

  static flags = {
    project: Flags.string({char: 'p', description: 'Filter by project (key or UUID)'}),
    kind: Flags.string({description: 'Filter by kind: note|decision|guide (repeatable or comma-separated)', multiple: true}),
    // Single value, exactly like `kb list --status`: the endpoint reads one `status=` and answers
    // R422-KNOWLEDGE-011 to anything else, so a repeatable flag would only build queries the server
    // rejects. `all` is the one that looks everywhere at once — the way to spot a duplicate that
    // exists as a proposal without running a second command.
    status: Flags.string({description: 'Filter by review state', options: [...KNOWLEDGE_STATUSES]}),
    per: Flags.integer({description: 'Page size'}),
    // Opt-in: the server only computes this when asked, for the first few results.
    'with-related': Flags.boolean({description: 'Also show the pages each result links to'}),
    ...pageFlag,
  }

  async run(): Promise<unknown> {
    const {argv, flags} = await this.parse(KbSearch)
    const q = (argv as string[]).join(' ').trim()
    if (q === '') this.error('Provide a search query (e.g. "kb search kamal rollback").', {exit: 2})

    const query = buildPagesQuery({
      kinds: normalizeKinds(flags.kind),
      page: flags.page,
      per: flags.per,
      project: flags.project,
      q,
      related: flags['with-related'],
      status: flags.status,
    })
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/knowledge/pages?${query}`)
    const pages = res.data ?? []

    if (!this.jsonEnabled()) {
      // meta.search tells us whether the server ran a semantic query or fell back to a title ILIKE.
      if (res.meta?.search === 'like') {
        this.log('(semantic search unavailable — showing title matches)')
      }

      this.log(renderPagesTable(pages))

      const grouped = (res.meta?.related ?? {}) as Record<string, RelatedRow[]>
      const block = renderRelatedGroups(pages, grouped)
      if (block !== '') this.log(block)
    }

    return res
  }
}
