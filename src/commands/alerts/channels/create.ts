import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'
import {renderRecord} from '../../../lib/output'

export default class AlertsChannelsCreate extends BaseCommand {
  static args = {
    name: Args.string({description: 'Channel name', required: true}),
  }

  static description = 'Create an external alert channel (webhook or Telegram)'

  static examples = [
    '<%= config.bin %> alerts channels create "Ops Telegram" --kind telegram --bot-token <token> --chat-id <id>',
    '<%= config.bin %> alerts channels create "Ops hook" --kind webhook --url https://example.com/hook --secret s3cret',
  ]

  static flags = {
    kind: Flags.string({description: 'Channel kind', options: ['webhook', 'telegram'], required: true}),
    url: Flags.string({description: 'Webhook URL (kind webhook)'}),
    secret: Flags.string({description: 'Webhook signing secret (kind webhook, optional)'}),
    'bot-token': Flags.string({description: 'Telegram bot token from @BotFather (kind telegram)'}),
    'chat-id': Flags.string({description: 'Telegram chat id receiving the messages (kind telegram)'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(AlertsChannelsCreate)

    const body: Record<string, unknown> = {name: args.name, kind: flags.kind}
    if (flags.url !== undefined) body.webhook_url = flags.url
    if (flags.secret !== undefined) body.webhook_secret = flags.secret
    if (flags['bot-token'] !== undefined) body.telegram_bot_token = flags['bot-token']
    if (flags['chat-id'] !== undefined) body.telegram_chat_id = flags['chat-id']

    const res = await this.api.post<Record<string, unknown>>('/cli/v1/alert_channels', body)

    if (!this.jsonEnabled()) {
      this.log('Channel created:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
