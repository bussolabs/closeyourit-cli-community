import {BaseCommand, pageFlag} from '../../base'
import {renderTable} from '../../lib/output'

export default class GroupsList extends BaseCommand {
  static description = 'List the groups (macro-projects) in your organization'

  static examples = ['<%= config.bin %> groups list', '<%= config.bin %> groups list --page 2 --json']

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(GroupsList)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/groups?page=${flags.page}`)
    const groups = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['NAME', 'COLOR', 'ID'],
          groups.map((group) => [String(group.name ?? ''), String(group.color ?? ''), String(group.id ?? '')]),
        ),
      )
    }

    return res
  }
}
