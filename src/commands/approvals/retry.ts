import {BaseCommand} from '../../base'
import {REVIEW_BLOCKED, fetchApproval, refArg, resolveApproval, sendDecision} from '../../lib/approvals'

export default class ApprovalsRetry extends BaseCommand {
  static description = 'Retry a stopped piece of work (a request in review_blocked): the agent starts it again.'

  static examples = ['<%= config.bin %> approvals retry CYRA-12']

  static args = refArg

  async run(): Promise<unknown> {
    const {args} = await this.parse(ApprovalsRetry)
    const target = await resolveApproval(this.api, args.ref)
    const {phase} = await fetchApproval(this.api, target)
    if (phase !== REVIEW_BLOCKED) {
      this.error(`${args.ref} is not stopped work (phase: ${phase ?? 'none'}): use "approvals approve" instead.`, {exit: 2})
    }

    const res = await sendDecision(this.api, target, {decision: 'approve'})
    if (!this.jsonEnabled()) this.log(`Retry requested: ${args.ref}.`)
    return res
  }
}
