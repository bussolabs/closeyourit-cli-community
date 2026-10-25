import {Args} from '@oclif/core'
import {BaseCommand} from '../../../base'
import {renderRecord} from '../../../lib/output'

export default class AlertsNotificationsRead extends BaseCommand {
  static args = {
    id: Args.string({description: 'Notification id', required: true}),
  }

  static description = 'Mark a single notification as read (idempotent)'

  static examples = ['<%= config.bin %> alerts notifications read <notification-id>']

  async run(): Promise<unknown> {
    const {args} = await this.parse(AlertsNotificationsRead)
    const res = await this.api.put<Record<string, unknown>>(`/cli/v1/alert_notifications/${args.id}/read`)

    if (!this.jsonEnabled()) {
      this.log(`Notification ${args.id} marked read:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
