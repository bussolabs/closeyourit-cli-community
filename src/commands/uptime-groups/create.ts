import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class UptimeGroupsCreate extends BaseCommand {
  static description = 'Create an uptime monitor group (org-level container)'

  static examples = [
    '<%= config.bin %> uptime-groups create --name "Core services"',
    '<%= config.bin %> uptime-groups create --name API --color sky --icon server --description "Public API"',
  ]

  static flags = {
    name: Flags.string({description: 'Group name', required: true}),
    color: Flags.string({description: 'Accent color (Tailwind palette name)'}),
    icon: Flags.string({description: 'Icon name'}),
    description: Flags.string({description: 'Group description'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(UptimeGroupsCreate)

    const body: Record<string, unknown> = {name: flags.name}
    if (flags.color !== undefined) body.color = flags.color
    if (flags.icon !== undefined) body.icon = flags.icon
    if (flags.description !== undefined) body.description = flags.description

    const res = await this.api.post<Record<string, unknown>>('/cli/v1/uptime_groups', body)

    if (!this.jsonEnabled()) {
      this.log('Uptime group created:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
