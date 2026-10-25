import {BaseCommand, pageFlag} from '../../../base'
import {renderTable} from '../../../lib/output'

export default class AlertsChannelsList extends BaseCommand {
  static description = 'List the external alert channels (webhook / Telegram)'

  static examples = ['<%= config.bin %> alerts channels list']

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(AlertsChannelsList)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/alert_channels?page=${flags.page}`)
    const channels = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['NAME', 'KIND', 'TARGET', 'ENABLED', 'ID'],
          channels.map((channel) => [
            String(channel.name ?? ''),
            String(channel.kind ?? ''),
            String(channel.target ?? '-'),
            String(channel.enabled ?? ''),
            String(channel.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
