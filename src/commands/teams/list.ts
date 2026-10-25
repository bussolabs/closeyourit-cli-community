import {BaseCommand, pageFlag} from '../../base'
import {renderTable} from '../../lib/output'

export default class TeamsList extends BaseCommand {
  static description = 'List the teams (people with scope) in your organization'

  static examples = ['<%= config.bin %> teams list', '<%= config.bin %> teams list --json']

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(TeamsList)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/teams?page=${flags.page}`)
    const teams = res.data ?? []
    const count = (value: unknown): string => String((Array.isArray(value) ? value : []).length)

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['NAME', 'ROLES', 'GROUPS', 'PROJECTS', 'MEMBERS', 'ID'],
          teams.map((team) => [
            String(team.name ?? ''),
            count(team.role_ids),
            count(team.group_ids),
            count(team.project_ids),
            count(team.member_ids),
            String(team.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
