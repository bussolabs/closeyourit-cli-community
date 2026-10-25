import {Args} from '@oclif/core'
import {BaseCommand} from '../../../base'
import {renderRecord} from '../../../lib/output'
import {WORKLOAD_ACTIONS_PATH, participantsLine} from '../../../lib/workload'

export default class WorkloadParticipantAdd extends BaseCommand {
  static args = {
    action: Args.string({description: 'Workload action id', required: true}),
    member: Args.string({description: 'Participant account id or email (must be on the action team)', required: true}),
  }

  static description = 'Add someone to a workload action (they must belong to the team that owns it)'

  static examples = ['<%= config.bin %> workload participant add <action-id> ada@acme.com']

  async run(): Promise<unknown> {
    const {args} = await this.parse(WorkloadParticipantAdd)
    const accountId = await this.resolveMemberId(args.member)

    const res = await this.api.post<Record<string, unknown>>(
      `${WORKLOAD_ACTIONS_PATH}/${encodeURIComponent(args.action)}/participants`,
      {account_id: accountId},
    )
    const data = res.data ?? {}

    if (!this.jsonEnabled()) {
      this.log(`Added ${args.member} to workload action ${args.action}:`)
      this.log(renderRecord(data))
      this.log(participantsLine(data))
    }

    return res
  }
}
