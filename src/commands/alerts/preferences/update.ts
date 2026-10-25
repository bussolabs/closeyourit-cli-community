import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'
import {renderRecord} from '../../../lib/output'

export default class AlertsPreferencesUpdate extends BaseCommand {
  static description = 'Update your personal alert preferences (send only the fields you want to change)'

  static examples = [
    '<%= config.bin %> alerts preferences update --no-email-enabled --min-level error',
    '<%= config.bin %> alerts preferences update --quiet-hours-enabled --quiet-hours-start 22:00 --quiet-hours-end 07:00 --quiet-hours-tz Europe/Rome',
  ]

  static flags = {
    'in-app-enabled': Flags.boolean({allowNo: true, description: 'Deliver notifications in-app'}),
    'email-enabled': Flags.boolean({allowNo: true, description: 'Deliver notifications by email'}),
    'errors-enabled': Flags.boolean({allowNo: true, description: 'Receive error alerts'}),
    'uptime-enabled': Flags.boolean({allowNo: true, description: 'Receive uptime alerts'}),
    'tickets-enabled': Flags.boolean({allowNo: true, description: 'Receive ticket notifications'}),
    'chat-enabled': Flags.boolean({allowNo: true, description: 'Receive chat notifications'}),
    'servers-enabled': Flags.boolean({allowNo: true, description: 'Receive server alerts'}),
    'min-level': Flags.string({description: 'Minimum error level that notifies you'}),
    'quiet-hours-enabled': Flags.boolean({allowNo: true, description: 'Enable the quiet-hours window'}),
    'quiet-hours-start': Flags.string({description: 'Quiet-hours start (HH:MM)'}),
    'quiet-hours-end': Flags.string({description: 'Quiet-hours end (HH:MM)'}),
    'quiet-hours-tz': Flags.string({description: 'Quiet-hours timezone (IANA, e.g. Europe/Rome)'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(AlertsPreferencesUpdate)

    const body: Record<string, unknown> = {}
    if (flags['in-app-enabled'] !== undefined) body.in_app_enabled = flags['in-app-enabled']
    if (flags['email-enabled'] !== undefined) body.email_enabled = flags['email-enabled']
    if (flags['errors-enabled'] !== undefined) body.errors_enabled = flags['errors-enabled']
    if (flags['uptime-enabled'] !== undefined) body.uptime_enabled = flags['uptime-enabled']
    if (flags['tickets-enabled'] !== undefined) body.tickets_enabled = flags['tickets-enabled']
    if (flags['chat-enabled'] !== undefined) body.chat_enabled = flags['chat-enabled']
    if (flags['servers-enabled'] !== undefined) body.servers_enabled = flags['servers-enabled']
    if (flags['min-level'] !== undefined) body.min_level = flags['min-level']
    // The backend keeps the quiet window only when quiet_hours_enabled is the string "1" (else it clears
    // start/end). Map the boolean flag to that sentinel; pass start/end/tz through untouched.
    if (flags['quiet-hours-enabled'] !== undefined) body.quiet_hours_enabled = flags['quiet-hours-enabled'] ? '1' : '0'
    if (flags['quiet-hours-start'] !== undefined) body.quiet_hours_start = flags['quiet-hours-start']
    if (flags['quiet-hours-end'] !== undefined) body.quiet_hours_end = flags['quiet-hours-end']
    if (flags['quiet-hours-tz'] !== undefined) body.quiet_hours_tz = flags['quiet-hours-tz']

    const res = await this.api.put<Record<string, unknown>>('/cli/v1/alert_preferences', body)

    if (!this.jsonEnabled()) {
      this.log('Alert preferences updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
