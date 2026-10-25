import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {WORKLOAD_ACTIONS_PATH} from '../../lib/workload'

export default class WorkloadDelete extends BaseCommand {
  static args = {
    id: Args.string({description: 'Workload action id', required: true}),
  }

  static description = 'Delete a workload action (irreversible; a linked ticket survives and only loses the link)'

  static examples = ['<%= config.bin %> workload delete <action-id> --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the irreversible deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(WorkloadDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm (the action is irreversible).', {exit: 2})
    }

    await this.api.delete(`${WORKLOAD_ACTIONS_PATH}/${encodeURIComponent(args.id)}`)

    if (!this.jsonEnabled()) this.log(`Deleted workload action ${args.id}`)

    return {deleted: args.id}
  }
}
