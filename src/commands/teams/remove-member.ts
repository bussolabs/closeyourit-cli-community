import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class TeamsRemoveMember extends BaseCommand {
  static args = {
    team: Args.string({description: 'Team id (UUID) or name', required: true}),
    member: Args.string({description: 'Member account id or email', required: true}),
  }

  static description = 'Remove a person from a team, keeping the other members'

  static examples = ['<%= config.bin %> teams remove-member DriverOne client@acme.com']

  async run(): Promise<unknown> {
    const {args} = await this.parse(TeamsRemoveMember)
    const teamId = await this.resolveTeamId(args.team)
    const memberId = await this.resolveMemberId(args.member)

    const current = await this.api.get<Record<string, unknown>>(`/cli/v1/teams/${teamId}`)
    const existing = Array.isArray(current.data.member_ids) ? (current.data.member_ids as string[]) : []
    const memberIds = existing.filter((id) => id !== memberId)

    const res = await this.api.put<Record<string, unknown>>(`/cli/v1/teams/${teamId}`, {member_ids: memberIds})

    if (!this.jsonEnabled()) {
      this.log(`Removed ${args.member} from team ${args.team} (${memberIds.length} members left).`)
    }

    return res
  }
}
