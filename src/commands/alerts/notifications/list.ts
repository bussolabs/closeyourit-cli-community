import {BaseCommand, pageFlag} from '../../../base'
import {renderTable} from '../../../lib/output'

export default class AlertsNotificationsList extends BaseCommand {
  static description = 'List your in-app alert notifications (your own inbox)'

  static examples = [
    '<%= config.bin %> alerts notifications list',
    '<%= config.bin %> alerts notifications list --page 2 --json',
  ]

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(AlertsNotificationsList)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/alert_notifications?page=${flags.page}`)
    const notifications = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['CREATED_AT', 'READ', 'TYPE', 'TITLE', 'ID'],
          notifications.map((notification) => [
            String(notification.created_at ?? ''),
            String(notification.read ?? ''),
            String(notification.event_type ?? ''),
            String(notification.title ?? ''),
            String(notification.id ?? ''),
          ]),
        ),
      )
      this.log(`\nUnread: ${String(res.meta?.unread ?? 0)}`)
    }

    return res
  }
}
