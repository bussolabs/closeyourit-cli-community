import {BaseCommand} from '../../../base'
import {renderRecord} from '../../../lib/output'

export default class AlertsPreferencesShow extends BaseCommand {
  static description = 'Show your personal alert preferences (per organization)'

  static examples = ['<%= config.bin %> alerts preferences show']

  async run(): Promise<unknown> {
    // No flags of its own, but the parser is what rejects a mistyped one (CYCL-33).
    await this.parse(AlertsPreferencesShow)
    const res = await this.api.get<Record<string, unknown>>('/cli/v1/alert_preferences')

    if (!this.jsonEnabled()) {
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
