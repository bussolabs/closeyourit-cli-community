import {BaseCommand} from '../../base'
import {refArg, resolveApproval, sendDecision} from '../../lib/approvals'

export default class ApprovalsReassess extends BaseCommand {
  static description = 'Send the request back to be assessed again from scratch, without approving or rejecting it.'

  static examples = ['<%= config.bin %> approvals reassess CYRA-12']

  static args = refArg

  async run(): Promise<unknown> {
    const {args} = await this.parse(ApprovalsReassess)
    const res = await sendDecision(this.api, await resolveApproval(this.api, args.ref), {decision: 'reassess'})
    if (!this.jsonEnabled()) this.log(`Sent back to be reassessed: ${args.ref}.`)
    return res
  }
}
