import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'

export default class AssistantConversationsDelete extends BaseCommand {
  static description = 'Delete a conversation with the assistant, questions and answers included (irreversible)'

  static examples = ['<%= config.bin %> assistant conversations delete <conversation-id> --confirm']

  static args = {
    id: Args.string({description: 'Conversation id', required: true}),
  }

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the irreversible deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(AssistantConversationsDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm (the action is irreversible).', {exit: 2})
    }

    await this.api.delete(`/cli/v1/assistant/conversations/${encodeURIComponent(args.id)}`)

    if (!this.jsonEnabled()) this.log(`Deleted conversation ${args.id}`)

    return {deleted: args.id}
  }
}
