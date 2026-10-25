import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class GroupsCreate extends BaseCommand {
  static args = {
    name: Args.string({description: 'Group name', required: true}),
  }

  static description = 'Create a group (a container of related projects, e.g. "DriverOne")'

  static examples = [
    '<%= config.bin %> groups create DriverOne',
    '<%= config.bin %> groups create DriverOne --color indigo',
  ]

  static flags = {
    color: Flags.string({description: 'Color label'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(GroupsCreate)

    const body: Record<string, unknown> = {name: args.name}
    if (flags.color !== undefined) body.color = flags.color

    const res = await this.api.post<Record<string, unknown>>('/cli/v1/groups', body)

    if (!this.jsonEnabled()) {
      this.log('Group created:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
