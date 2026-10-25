import {Args} from '@oclif/core'
import {BaseCommand} from '../../../base'
import {WORKLOAD_ACTIONS_PATH} from '../../../lib/workload'

export default class WorkloadParticipantRemove extends BaseCommand {
  static args = {
    action: Args.string({description: 'Workload action id', required: true}),
    member: Args.string({description: 'Participant account id or email', required: true}),
  }

  static description = 'Remove someone from a workload action (idempotent: removing who is not there succeeds)'

  static examples = ['<%= config.bin %> workload participant remove <action-id> ada@acme.com']

  async run(): Promise<unknown> {
    const {args} = await this.parse(WorkloadParticipantRemove)
    const accountId = await this.resolveMemberId(args.member)

    await this.api.delete(
      `${WORKLOAD_ACTIONS_PATH}/${encodeURIComponent(args.action)}/participants/${encodeURIComponent(accountId)}`,
    )

    if (!this.jsonEnabled()) {
      this.log(`Removed ${args.member} from workload action ${args.action}`)
    }

    return {removed: accountId}
  }
}
