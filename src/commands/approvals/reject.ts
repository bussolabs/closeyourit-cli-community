import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {refArg, resolveApproval, sendDecision} from '../../lib/approvals'

export default class ApprovalsReject extends BaseCommand {
  static description = 'Reject a request with a reason: the reason reaches whoever did the work or asked for the change.'

  static examples = ['<%= config.bin %> approvals reject CYRA-12 --reason "split it in two tickets first"']

  static args = refArg

  static flags = {
    reason: Flags.string({char: 'r', description: 'Why it is refused (required)', required: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ApprovalsReject)
    const reason = flags.reason.trim()
    if (reason === '') this.error('Refusing to reject with an empty --reason: say why, so it can be fixed.', {exit: 2})
    const res = await sendDecision(this.api, await resolveApproval(this.api, args.ref), {decision: 'reject', text: reason})
    if (!this.jsonEnabled()) this.log(`Rejected: ${args.ref}.`)
    return res
  }
}
