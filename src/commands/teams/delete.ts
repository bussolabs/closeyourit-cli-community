import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class TeamsDelete extends BaseCommand {
  static args = {
    team: Args.string({description: 'Team id (UUID) or name', required: true}),
  }

  static description = 'Delete a team (its members lose the access this team granted)'

  static examples = ['<%= config.bin %> teams delete DriverOne']

  async run(): Promise<unknown> {
    const {args} = await this.parse(TeamsDelete)
    const id = await this.resolveTeamId(args.team)
    await this.api.delete(`/cli/v1/teams/${id}`)

    if (!this.jsonEnabled()) {
      this.log(`Team deleted: ${args.team}`)
    }

    return {deleted: id}
  }
}
