import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {RelatedRow, renderRelated} from '../../lib/knowledge'
import {sanitize, sanitizeMultiline} from '../../lib/output'

export default class KbAsk extends BaseCommand {
  // Variadic question: every positional word is joined into a single natural-language question.
  static strict = false

  static description =
    'Ask a natural-language question; the server AI answers from the knowledge base and cites the pages it used (may take a few seconds)'

  static examples = [
    '<%= config.bin %> kb ask how do we roll back a kamal deploy',
    '<%= config.bin %> kb ask "what is our retry/backoff policy?" --json',
  ]

  // Non-required: with strict = false the arg validation is off, so we guard the empty case ourselves.
  static args = {
    question: Args.string({description: 'The question (all positional words are joined)'}),
  }

  async run(): Promise<unknown> {
    const {argv} = await this.parse(KbAsk)
    const question = (argv as string[]).join(' ').trim()
    if (question === '') this.error('Provide a question (e.g. "kb ask how do we roll back a deploy").', {exit: 2})

    if (!this.jsonEnabled()) this.log('Asking the knowledge base (AI), this may take a few seconds…')

    const res = await this.api.post<{
      answer?: string
      insufficient?: boolean
      pages?: Array<Record<string, unknown>>
      related?: RelatedRow[]
    }>('/cli/v1/knowledge/ask', {question})
    const data = res.data ?? {}

    if (!this.jsonEnabled()) {
      if (data.insufficient) {
        this.log('The knowledge base does not have enough to answer this confidently.')
      }

      const answer = String(data.answer ?? '').trim()
      if (answer !== '') this.log(sanitizeMultiline(data.answer))

      const pages = Array.isArray(data.pages) ? data.pages : []
      if (pages.length > 0) {
        this.log('\n📚 Sources:')
        for (const page of pages) {
          this.log(`  [${sanitize(page.kind)}] ${sanitize(page.title)} · ${sanitize(page.id)}`)
        }
      }

      // Second hop: what the cited pages point to, kept only when it matches the question.
      const related = Array.isArray(data.related) ? data.related : []
      if (related.length > 0) this.log(renderRelated(related))
    }

    return res
  }
}
