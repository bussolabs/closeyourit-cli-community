import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord, sanitize, sanitizeMultiline, section} from '../../lib/output'

export default class WikitechShow extends BaseCommand {
  static description = 'Show a Wikitech entry: summary, facts, repository data, links and sources'

  static examples = ['<%= config.bin %> wikitech show <entry-id>', '<%= config.bin %> wikitech show <entry-id> --json']

  static args = {
    id: Args.string({description: 'Wikitech entry id', required: true}),
  }

  async run(): Promise<unknown> {
    const {args} = await this.parse(WikitechShow)
    const res = await this.api.get<Record<string, unknown>>(`/cli/v1/wikitech/entries/${encodeURIComponent(args.id)}`)
    const entry = res.data ?? {}

    if (!this.jsonEnabled()) {
      this.log(
        renderRecord({
          id: entry.id,
          name: entry.name,
          categories: Array.isArray(entry.categories) ? entry.categories.join(', ') : undefined,
          verification: entry.verification,
          repo_url: entry.repo_url,
          updated_at: entry.updated_at,
        }),
      )

      if (entry.summary) {
        this.log('')
        this.log(sanitizeMultiline(entry.summary))
      }

      const facts = asList<string>(entry.facts)
      if (facts.length > 0) {
        this.log(section('Facts'))
        for (const fact of facts) this.log(`  • ${sanitize(fact)}`)
      }

      const repo = entry.repo as Record<string, unknown> | null | undefined
      if (repo) {
        this.log(section('Repository'))
        this.log(renderRecord(repo))
      }

      const links = asList<string>(entry.links)
      if (links.length > 0) {
        this.log(section('Links'))
        for (const link of links) this.log(`  ${sanitize(link)}`)
      }

      const sources = asList<Record<string, unknown>>(entry.sources)
      if (sources.length > 0) {
        this.log(section('Sources'))
        for (const source of sources) {
          const head = [source.label, source.published_at, source.url].filter(Boolean).map(sanitize).join(' · ')
          this.log(`  ${head}`)
          if (source.quote) this.log(`    "${sanitize(source.quote)}"`)
        }
      }
    }

    return res
  }
}

function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}
