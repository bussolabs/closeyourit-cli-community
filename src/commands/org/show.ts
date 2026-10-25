import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class OrgShow extends BaseCommand {
  static description = 'Show your organization settings'

  static examples = ['<%= config.bin %> org show', '<%= config.bin %> org show --json']

  async run(): Promise<unknown> {
    // No flags of its own, but the parser is what rejects a mistyped one (CYCL-33).
    await this.parse(OrgShow)
    const res = await this.api.get<Record<string, unknown>>('/cli/v1/organization')

    if (!this.jsonEnabled()) {
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
