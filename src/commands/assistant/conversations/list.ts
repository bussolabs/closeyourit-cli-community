import {Flags} from '@oclif/core'
import {BaseCommand, pageFlag, paginationError} from '../../../base'
import {renderConversationsTable} from '../../../lib/assistant'

export default class AssistantConversationsList extends BaseCommand {
  static description = 'List your conversations with the assistant (most recently active first)'

  static examples = [
    '<%= config.bin %> assistant conversations list',
    '<%= config.bin %> assistant conversations list --per 50 --json',
  ]

  static flags = {
    per: Flags.integer({description: 'Page size'}),
    ...pageFlag,
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(AssistantConversationsList)
    const invalid = paginationError(flags)
    if (invalid) this.error(invalid, {exit: 2})

    const query = new URLSearchParams({page: String(flags.page)})
    if (flags.per !== undefined) query.set('per', String(flags.per))
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/assistant/conversations?${query.toString()}`)

    if (!this.jsonEnabled()) this.log(renderConversationsTable(res.data ?? []))

    return res
  }
}
