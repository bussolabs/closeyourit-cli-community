import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {refArg, resolveApproval, sendDecision} from '../../lib/approvals'

export default class ApprovalsAsk extends BaseCommand {
  static description = 'Ask a question back instead of deciding: the request waits until the answer comes.'

  static examples = ['<%= config.bin %> approvals ask CYRA-12 --text "why not reuse the existing job?"']

  static args = refArg

  static flags = {
    text: Flags.string({char: 't', description: 'Your question (required)', required: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ApprovalsAsk)
    const text = flags.text.trim()
    if (text === '') this.error('Refusing to send an empty question: write it in --text.', {exit: 2})
    const res = await sendDecision(this.api, await resolveApproval(this.api, args.ref), {decision: 'ask', text})
    if (!this.jsonEnabled()) this.log(`Question sent: ${args.ref}.`)
    return res
  }
}
