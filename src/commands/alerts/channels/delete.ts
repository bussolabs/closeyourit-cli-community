import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'

export default class AlertsChannelsDelete extends BaseCommand {
  static args = {
    id: Args.string({description: 'Channel id', required: true}),
  }

  static description = 'Delete an external alert channel (rules keep delivering in-app/email)'

  static examples = ['<%= config.bin %> alerts channels delete <channel-id> --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(AlertsChannelsDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm.', {exit: 2})
    }

    await this.api.delete(`/cli/v1/alert_channels/${encodeURIComponent(args.id)}`)

    if (!this.jsonEnabled()) this.log(`Deleted channel ${args.id}`)

    return {deleted: args.id}
  }
}
