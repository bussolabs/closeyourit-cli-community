import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {refArg, resolveApproval, sendDecision} from '../../lib/approvals'

export default class ApprovalsApprove extends BaseCommand {
  static description = 'Approve a request: the plan goes ahead, the delivered work is accepted, the secret change is applied.'

  static examples = [
    '<%= config.bin %> approvals approve CYRA-12',
    '<%= config.bin %> approvals approve agent_plan:<id> --note "go ahead, keep the migration small"',
  ]

  static args = refArg

  static flags = {
    note: Flags.string({char: 'n', description: 'Optional note sent with the approval'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ApprovalsApprove)
    const note = flags.note?.trim()
    const res = await sendDecision(this.api, await resolveApproval(this.api, args.ref), {
      decision: 'approve',
      ...(note ? {text: note} : {}),
    })
    if (!this.jsonEnabled()) this.log(`Approved: ${args.ref}.`)
    return res
  }
}
