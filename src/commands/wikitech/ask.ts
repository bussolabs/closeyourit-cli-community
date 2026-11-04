import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {sanitize, sanitizeMultiline} from '../../lib/output'

export default class WikitechAsk extends BaseCommand {
  // Variadic question: every positional word is joined into a single natural-language question.
  static strict = false

  static description =
    'Ask a tech question; the server AI answers from the Wikitech entries and cites the ones it used (may take a few seconds)'

  static examples = [
    '<%= config.bin %> wikitech ask which python package manager is the fastest',
    '<%= config.bin %> wikitech ask "is there a self-hosted vector database?" --json',
  ]

  // Non-required: with strict = false the arg validation is off, so we guard the empty case ourselves.
  static args = {
    question: Args.string({description: 'The question (all positional words are joined)'}),
  }

  async run(): Promise<unknown> {
    const {argv} = await this.parse(WikitechAsk)
    const question = (argv as string[]).join(' ').trim()
    if (question === '') this.error('Provide a question (e.g. "wikitech ask which python package manager").', {exit: 2})

    if (!this.jsonEnabled()) this.log('Asking Wikitech (AI), this may take a few seconds…')

    const res = await this.api.post<{
      answer?: string | null
      insufficient?: boolean
      entries?: Array<Record<string, unknown>>
    }>('/cli/v1/wikitech/asks', {question})
    const data = res.data ?? {}

    if (!this.jsonEnabled()) {
      if (data.insufficient) this.log('Wikitech does not have enough to answer this.')

      const answer = String(data.answer ?? '').trim()
      if (answer !== '') this.log(sanitizeMultiline(answer))

      const entries = Array.isArray(data.entries) ? data.entries : []
      if (entries.length > 0) {
        this.log('\n📚 Cited entries:')
        for (const entry of entries) this.log(`  ${sanitize(entry.name)} · ${sanitize(entry.id)}`)
      }
    }

    return res
  }
}
