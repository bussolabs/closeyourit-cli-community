import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class AlertsDelete extends BaseCommand {
  static args = {
    id: Args.string({description: 'Alert rule id', required: true}),
  }

  static description = 'Delete an alert rule'

  static examples = ['<%= config.bin %> alerts delete <rule-id> --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(AlertsDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm.', {exit: 2})
    }

    await this.api.delete(`/cli/v1/alert_rules/${encodeURIComponent(args.id)}`)

    if (!this.jsonEnabled()) this.log(`Deleted alert rule ${args.id}`)

    return {deleted: args.id}
  }
}
