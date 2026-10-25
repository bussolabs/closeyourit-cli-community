import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class GroupsUpdate extends BaseCommand {
  static args = {
    group: Args.string({description: 'Group id (UUID) or name', required: true}),
  }

  static description = 'Update a group (rename, recolor)'

  static examples = [
    '<%= config.bin %> groups update Backend --name "Backend services"',
    '<%= config.bin %> groups update Backend --color indigo',
  ]

  static flags = {
    name: Flags.string({description: 'New name'}),
    color: Flags.string({description: 'Color label'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(GroupsUpdate)
    const id = await this.resolveGroupId(args.group)

    const body: Record<string, unknown> = {}
    if (flags.name !== undefined) body.name = flags.name
    if (flags.color !== undefined) body.color = flags.color

    const res = await this.api.put<Record<string, unknown>>(`/cli/v1/groups/${id}`, body)

    if (!this.jsonEnabled()) {
      this.log('Group updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
