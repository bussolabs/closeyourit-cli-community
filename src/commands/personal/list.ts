import {BaseCommand} from '../../base'
import {renderTable} from '../../lib/output'

export default class PersonalList extends BaseCommand {
  static description = 'List your personal secret names for the current organization. Never prints values.'

  static examples = ['<%= config.bin %> personal list', '<%= config.bin %> personal list --json']

  async run(): Promise<unknown> {
    await this.parse(PersonalList)
    const res = await this.api.get<Array<Record<string, unknown>>>('/cli/v1/personal_secrets')

    if (!this.jsonEnabled()) {
      const rows = (res.data ?? []).map((secret) => [String(secret.name ?? ''), String(secret.description ?? '')])
      this.log(renderTable(['NAME', 'DESCRIPTION'], rows))
    }

    return res
  }
}
