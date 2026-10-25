import {Args} from '@oclif/core'
import {BaseCommand} from '../../../base'
import {renderBook} from '../../../lib/knowledge'

export default class KbBookShow extends BaseCommand {
  static description = 'Show a knowledge book: its metadata, then the summary of the pages it collects'

  static examples = ['<%= config.bin %> kb book show <book-id>', '<%= config.bin %> kb book show <book-id> --json']

  static args = {
    id: Args.string({description: 'Knowledge book id', required: true}),
  }

  async run(): Promise<unknown> {
    const {args} = await this.parse(KbBookShow)

    const res = await this.api.get<Record<string, unknown>>(
      `/cli/v1/knowledge/books/${encodeURIComponent(args.id)}`,
    )

    // The summary only lists the pages of the projects the reader can see, so a multi-project book
    // never shows titles from a project this account has no access to.
    if (!this.jsonEnabled()) this.log(renderBook(res.data ?? {}))

    return res
  }
}
