import {BaseCommand} from '../../base'
import {refArg, resolveApproval, sendDeferral} from '../../lib/approvals'

export default class ApprovalsDefer extends BaseCommand {
  static description = 'Put a request off to tomorrow morning: it is hidden from your queue until then, and nothing is decided.'

  static examples = ['<%= config.bin %> approvals defer CYRA-12']

  static args = refArg

  async run(): Promise<unknown> {
    const {args} = await this.parse(ApprovalsDefer)
    const res = await sendDeferral(this.api, await resolveApproval(this.api, args.ref))
    if (!this.jsonEnabled()) {
      const until = res.data?.until_at
      this.log(`Deferred: ${args.ref}${until ? ` until ${String(until)}` : ''}.`)
    }

    return res
  }
}
