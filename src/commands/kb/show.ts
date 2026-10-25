import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {RelatedRow, pageScopeLines, renderRelated} from '../../lib/knowledge'
import {renderRecord, sanitizeMultiline} from '../../lib/output'

export default class KbShow extends BaseCommand {
  static description = 'Show a single knowledge page: metadata header then the raw markdown body'

  static examples = [
    '<%= config.bin %> kb show <page-id>',
    '<%= config.bin %> kb show <page-id> --question "how do we roll back a deploy?"',
    '<%= config.bin %> kb show <page-id> --json',
  ]

  static args = {
    id: Args.string({description: 'Knowledge page id', required: true}),
  }

  static flags = {
    // Opt-in: without these flags the request is exactly what it has always been.
    related: Flags.boolean({description: 'Also list the pages to read next'}),
    question: Flags.string({description: 'Keep only the related pages relevant to this question (implies --related)'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(KbShow)

    const query = new URLSearchParams()
    if (flags.question) query.set('question', flags.question)
    else if (flags.related) query.set('related', '1')
    const suffix = query.toString() === '' ? '' : `?${query.toString()}`

    const res = await this.api.get<Record<string, unknown>>(
      `/cli/v1/knowledge/pages/${encodeURIComponent(args.id)}${suffix}`,
    )
    const page = res.data ?? {}

    if (!this.jsonEnabled()) {
      // Header first (scalar fields only), then the body on its own so the markdown stays intact.
      this.log(
        renderRecord({
          id: page.id,
          title: page.title,
          kind: page.kind,
          project: page.project,
          project_name: page.project_name,
          // The other projects, the groups and the tags: a page shared across several scopes read
          // as if it belonged only to the first one (CYCL-45).
          ...pageScopeLines(page),
          author: page.author,
          created_at: page.created_at,
          updated_at: page.updated_at,
        }),
      )

      const body = page.body
      if (body !== null && body !== undefined && String(body).trim() !== '') {
        this.log('')
        this.log(sanitizeMultiline(body))
      }

      // Technical section (kept separate from the simple body), shown after it under its own heading.
      const techSpec = page.tech_spec
      if (techSpec !== null && techSpec !== undefined && String(techSpec).trim() !== '') {
        this.log('\n🔧 Technical:')
        this.log(sanitizeMultiline(techSpec))
      }

      const related = (res.meta?.related ?? []) as RelatedRow[]
      if (related.length > 0) this.log(renderRelated(related))
    }

    return res
  }
}
