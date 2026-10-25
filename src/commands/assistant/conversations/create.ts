import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'
import {renderRecord} from '../../../lib/output'

export default class AssistantConversationsCreate extends BaseCommand {
  static description = 'Open an empty conversation with the assistant (ask questions into it with `assistant ask --conversation`)'

  static examples = [
    '<%= config.bin %> assistant conversations create',
    '<%= config.bin %> assistant conversations create --title "Stato dei rilasci"',
  ]

  static flags = {
    // Optional: without it the server titles the conversation after its first question, which is
    // what makes a list of past conversations searchable at all.
    title: Flags.string({description: 'Conversation title (defaults to the first question asked)'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(AssistantConversationsCreate)
    const res = await this.api.post<Record<string, unknown>>('/cli/v1/assistant/conversations', {title: flags.title})

    if (!this.jsonEnabled()) this.log(renderRecord(res.data ?? {}))

    return res
  }
}
