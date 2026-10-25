import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class UptimeGroupsUnpublish extends BaseCommand {
  static description = 'Unpublish (retract) the public status page for an uptime group'

  static examples = ['<%= config.bin %> uptime-groups unpublish <group-id>']

  static args = {
    id: Args.string({description: 'Uptime group id', required: true}),
  }

  async run(): Promise<unknown> {
    const {args} = await this.parse(UptimeGroupsUnpublish)
    const res = await this.api.delete<Record<string, unknown>>(`/cli/v1/uptime_groups/${args.id}/publication`)

    if (!this.jsonEnabled()) {
      this.log(`Unpublished the public status page for uptime group ${args.id}:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
