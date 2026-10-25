import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class GroupsDelete extends BaseCommand {
  static args = {
    group: Args.string({description: 'Group id (UUID) or name', required: true}),
  }

  static description = 'Delete a group (its projects are detached, not deleted)'

  static examples = ['<%= config.bin %> groups delete Backend --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(GroupsDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm.', {exit: 2})
    }

    const id = await this.resolveGroupId(args.group)
    await this.api.delete(`/cli/v1/groups/${id}`)

    if (!this.jsonEnabled()) this.log(`Deleted group ${args.group}`)

    return {deleted: id}
  }
}
