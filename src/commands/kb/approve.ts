import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

/**
 * First step of the review flow: a page proposed with `kb create --in-review` enters the knowledge
 * (search, answers, related panels). The server insists the decision comes from a person: a service
 * token gets R403-KNOWLEDGE-005, and a page the automatic reviewer rejected must be fixed and saved
 * first (R422-KNOWLEDGE-009).
 */
export default class KbApprove extends BaseCommand {
  static args = {
    id: Args.string({description: 'Knowledge page id', required: true}),
  }

  static description = 'Accept a page waiting for review: it enters search, answers and related panels'

  static examples = ['<%= config.bin %> kb approve <page-id>', '<%= config.bin %> kb approve <page-id> --json']

  async run(): Promise<unknown> {
    const {args} = await this.parse(KbApprove)

    const res = await this.api.post<Record<string, unknown>>(`/cli/v1/knowledge/pages/${args.id}/approve`)

    if (!this.jsonEnabled()) {
      this.log('Knowledge page accepted:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
