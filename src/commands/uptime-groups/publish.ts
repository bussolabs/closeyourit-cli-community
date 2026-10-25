import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class UptimeGroupsPublish extends BaseCommand {
  static description = 'Publish the public status page for an uptime group'

  static examples = ['<%= config.bin %> uptime-groups publish <group-id>']

  static args = {
    id: Args.string({description: 'Uptime group id', required: true}),
  }

  async run(): Promise<unknown> {
    const {args} = await this.parse(UptimeGroupsPublish)
    const res = await this.api.put<Record<string, unknown>>(`/cli/v1/uptime_groups/${args.id}/publication`)

    if (!this.jsonEnabled()) {
      this.log(`Published the public status page for uptime group ${args.id}:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
