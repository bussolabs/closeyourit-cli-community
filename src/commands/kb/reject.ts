import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

/**
 * Mirror of `kb approve`: the proposal stays archived as rejected — out of search, answers, related
 * panels and lists — so whoever proposes can see it when hunting duplicates and not propose it again.
 * Nothing is deleted (that is `kb delete`). A human decision, like approve.
 */
export default class KbReject extends BaseCommand {
  static args = {
    id: Args.string({description: 'Knowledge page id', required: true}),
  }

  static description = 'Discard a page waiting for review: it stays archived as rejected, out of search and answers'

  static examples = ['<%= config.bin %> kb reject <page-id>', '<%= config.bin %> kb reject <page-id> --json']

  async run(): Promise<unknown> {
    const {args} = await this.parse(KbReject)

    const res = await this.api.post<Record<string, unknown>>(`/cli/v1/knowledge/pages/${args.id}/reject`)

    if (!this.jsonEnabled()) {
      this.log('Knowledge page rejected:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
