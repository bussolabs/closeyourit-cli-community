import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'
import {WORKLOAD_ACTIONS_PATH, participantsLine} from '../../lib/workload'

export default class WorkloadShow extends BaseCommand {
  static args = {
    id: Args.string({description: 'Workload action id', required: true}),
  }

  static description = 'Show one workload action (an action of another team answers 404, never 403)'

  static examples = ['<%= config.bin %> workload show <action-id>']

  async run(): Promise<unknown> {
    const {args} = await this.parse(WorkloadShow)
    const res = await this.api.get<Record<string, unknown>>(
      `${WORKLOAD_ACTIONS_PATH}/${encodeURIComponent(args.id)}`,
    )

    if (!this.jsonEnabled()) {
      const data = res.data ?? {}
      this.log(renderRecord(data))
      this.log(participantsLine(data))
    }

    return res
  }
}
