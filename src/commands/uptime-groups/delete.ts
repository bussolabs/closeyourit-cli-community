import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class UptimeGroupsDelete extends BaseCommand {
  static description = 'Delete an uptime monitor group (irreversible)'

  static examples = ['<%= config.bin %> uptime-groups delete <group-id> --confirm']

  static args = {
    id: Args.string({description: 'Uptime group id', required: true}),
  }

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the irreversible deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(UptimeGroupsDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm (the action is irreversible).', {exit: 2})
    }

    await this.api.delete(`/cli/v1/uptime_groups/${args.id}`)

    if (!this.jsonEnabled()) this.log(`Deleted uptime group ${args.id}`)

    return {deleted: args.id}
  }
}
