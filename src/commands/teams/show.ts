import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TeamsShow extends BaseCommand {
  static args = {
    team: Args.string({description: 'Team id (UUID) or name', required: true}),
  }

  static description = 'Show a team by id or name (roles, group/project scope, members)'

  static examples = ['<%= config.bin %> teams show DriverOne']

  async run(): Promise<unknown> {
    const {args} = await this.parse(TeamsShow)
    const id = await this.resolveTeamId(args.team)
    const res = await this.api.get<Record<string, unknown>>(`/cli/v1/teams/${id}`)

    if (!this.jsonEnabled()) {
      const data = res.data ?? {}
      this.log(renderRecord(data))
      for (const field of ['role_ids', 'group_ids', 'project_ids', 'member_ids']) {
        const ids = Array.isArray(data[field]) ? (data[field] as string[]) : []
        this.log(`${field}: ${ids.length > 0 ? ids.join(', ') : '-'}`)
      }
    }

    return res
  }
}
