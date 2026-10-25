import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {RelatedRow, renderRelated} from '../../lib/knowledge'

export default class KbRelated extends BaseCommand {
  static description =
    'List the pages to read next: the ones this page links to (and that link to it), plus close matches by meaning'

  static examples = [
    '<%= config.bin %> kb related <page-id>',
    '<%= config.bin %> kb related <page-id> --question "how do we roll back a deploy?"',
    '<%= config.bin %> kb related <page-id> --links-only --json',
  ]

  static args = {
    id: Args.string({description: 'Knowledge page id', required: true}),
  }

  static flags = {
    // With a question the server scores every candidate against it and drops what does not match.
    question: Flags.string({description: 'Keep only the pages relevant to this question'}),
    'links-only': Flags.boolean({description: 'Only pages linked with [[wiki links]], no close matches'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(KbRelated)

    const query = new URLSearchParams()
    if (flags.question) query.set('question', flags.question)
    if (flags['links-only']) query.set('links_only', '1')
    const suffix = query.toString() === '' ? '' : `?${query.toString()}`

    const res = await this.api.get<RelatedRow[]>(
      `/cli/v1/knowledge/pages/${encodeURIComponent(args.id)}/related${suffix}`,
    )
    const rows = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(rows.length === 0 ? 'No related pages.' : renderRelated(rows, '🔗 Related:'))
    }

    return res
  }
}
