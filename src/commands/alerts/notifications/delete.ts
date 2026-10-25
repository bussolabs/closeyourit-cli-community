import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'

export default class AlertsNotificationsDelete extends BaseCommand {
  static args = {
    id: Args.string({description: 'Notification id', required: true}),
  }

  static description = 'Delete one of your notifications (irreversible)'

  static examples = ['<%= config.bin %> alerts notifications delete <notification-id> --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the irreversible deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(AlertsNotificationsDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm (the action is irreversible).', {exit: 2})
    }

    await this.api.delete(`/cli/v1/alert_notifications/${args.id}`)

    if (!this.jsonEnabled()) this.log(`Deleted notification ${args.id}`)

    return {deleted: args.id}
  }
}
