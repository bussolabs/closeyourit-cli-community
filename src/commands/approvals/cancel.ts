import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {REVIEW_BLOCKED, fetchApproval, refArg, resolveApproval, sendDecision} from '../../lib/approvals'

export default class ApprovalsCancel extends BaseCommand {
  static description = 'Cancel the workflow of a stopped piece of work (a request in review_blocked), with a reason.'

  static examples = ['<%= config.bin %> approvals cancel CYRA-12 --reason "not needed anymore"']

  static args = refArg

  static flags = {
    reason: Flags.string({char: 'r', description: 'Why the work is cancelled (required)', required: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ApprovalsCancel)
    const reason = flags.reason.trim()
    if (reason === '') this.error('Refusing to cancel with an empty --reason: say why.', {exit: 2})
    const target = await resolveApproval(this.api, args.ref)
    const {phase} = await fetchApproval(this.api, target)
    if (phase !== REVIEW_BLOCKED) {
      this.error(`${args.ref} is not stopped work (phase: ${phase ?? 'none'}): use "approvals reject" instead.`, {exit: 2})
    }

    const res = await sendDecision(this.api, target, {decision: 'reject', text: reason})
    if (!this.jsonEnabled()) this.log(`Workflow cancelled: ${args.ref}.`)
    return res
  }
}
