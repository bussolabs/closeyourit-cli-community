import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class SeoPromote extends BaseCommand {
  static description = 'Open a ticket from an SEO finding, evidence included'

  static examples = ['<%= config.bin %> seo promote <issue-id>']

  static args = {
    id: Args.string({description: 'SEO finding id', required: true}),
  }

  async run(): Promise<unknown> {
    const {args} = await this.parse(SeoPromote)
    // Idempotent server-side: promoting twice returns R422-SEO-001, never a second ticket.
    const res = await this.api.put<Record<string, unknown>>(`/cli/v1/seo/${args.id}/promotion`)

    if (!this.jsonEnabled()) {
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
