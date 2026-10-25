import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class UptimeGroupsUpdate extends BaseCommand {
  static description = 'Update an uptime monitor group (only the provided fields)'

  static examples = ['<%= config.bin %> uptime-groups update <group-id> --name "New name" --color emerald']

  static args = {
    id: Args.string({description: 'Uptime group id', required: true}),
  }

  static flags = {
    name: Flags.string({description: 'Group name'}),
    color: Flags.string({description: 'Accent color (Tailwind palette name)'}),
    icon: Flags.string({description: 'Icon name'}),
    description: Flags.string({description: 'Group description'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(UptimeGroupsUpdate)

    const body: Record<string, unknown> = {}
    if (flags.name !== undefined) body.name = flags.name
    if (flags.color !== undefined) body.color = flags.color
    if (flags.icon !== undefined) body.icon = flags.icon
    if (flags.description !== undefined) body.description = flags.description

    const res = await this.api.put<Record<string, unknown>>(`/cli/v1/uptime_groups/${args.id}`, body)

    if (!this.jsonEnabled()) {
      this.log(`Updated uptime group ${args.id}:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
