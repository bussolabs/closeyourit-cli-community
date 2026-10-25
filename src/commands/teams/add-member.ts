import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class TeamsAddMember extends BaseCommand {
  static args = {
    team: Args.string({description: 'Team id (UUID) or name', required: true}),
    member: Args.string({description: 'Member account id or email (must be an org member)', required: true}),
  }

  static description = 'Add a person to a team, keeping the existing members'

  static examples = ['<%= config.bin %> teams add-member DriverOne client@acme.com']

  async run(): Promise<unknown> {
    const {args} = await this.parse(TeamsAddMember)
    const teamId = await this.resolveTeamId(args.team)
    const memberId = await this.resolveMemberId(args.member)

    const current = await this.api.get<Record<string, unknown>>(`/cli/v1/teams/${teamId}`)
    const existing = Array.isArray(current.data.member_ids) ? (current.data.member_ids as string[]) : []
    const memberIds = [...new Set([...existing, memberId])]

    const res = await this.api.put<Record<string, unknown>>(`/cli/v1/teams/${teamId}`, {member_ids: memberIds})

    if (!this.jsonEnabled()) {
      this.log(`Added ${args.member} to team ${args.team} (${memberIds.length} members total).`)
    }

    return res
  }
}
