import {Args} from '@oclif/core'
import {BaseCommand} from '../../../base'
import {renderMessages} from '../../../lib/assistant'
import {renderRecord, section} from '../../../lib/output'

export default class AssistantConversationsShow extends BaseCommand {
  static description = 'Read one conversation with the assistant: its questions, its answers and what they were based on'

  static examples = ['<%= config.bin %> assistant conversations show <conversation-id>']

  static args = {
    id: Args.string({description: 'Conversation id', required: true}),
  }

  async run(): Promise<unknown> {
    const {args} = await this.parse(AssistantConversationsShow)
    const res = await this.api.get<Record<string, unknown>>(
      `/cli/v1/assistant/conversations/${encodeURIComponent(args.id)}`,
    )
    const data = res.data ?? {}

    if (!this.jsonEnabled()) {
      this.log(renderRecord(data))
      this.log(section('Messages', '💬'))
      this.log(renderMessages(data.messages))
    }

    return res
  }
}
