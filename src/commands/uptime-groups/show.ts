import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class UptimeGroupsShow extends BaseCommand {
  static description = 'Show an uptime monitor group'

  static examples = ['<%= config.bin %> uptime-groups show <group-id>']

  static args = {
    id: Args.string({description: 'Uptime group id', required: true}),
  }

  async run(): Promise<unknown> {
    const {args} = await this.parse(UptimeGroupsShow)
    const res = await this.api.get<Record<string, unknown>>(`/cli/v1/uptime_groups/${args.id}`)

    if (!this.jsonEnabled()) this.log(renderRecord(res.data ?? {}))

    return res
  }
}
