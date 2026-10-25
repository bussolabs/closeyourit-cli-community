import {BaseCommand} from '../../../base'

export default class AlertsNotificationsReadAll extends BaseCommand {
  static description = 'Mark all your unread notifications as read'

  static examples = ['<%= config.bin %> alerts notifications read-all']

  async run(): Promise<unknown> {
    // Validate the command line before marking anything read: a mistyped flag must stop the
    // command instead of being ignored (CYCL-33).
    await this.parse(AlertsNotificationsReadAll)
    const res = await this.api.put<{marked_read?: number}>('/cli/v1/alert_notifications/read_all')

    if (!this.jsonEnabled()) {
      this.log(`Marked ${res.data?.marked_read ?? 0} notification(s) read`)
    }

    return res
  }
}
