import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class RolesDelete extends BaseCommand {
  static args = {
    role: Args.string({description: 'Role id (UUID) or name', required: true}),
  }

  static description = 'Delete a role (its assignments to teams and accounts are removed)'

  static examples = ['<%= config.bin %> roles delete Client']

  async run(): Promise<unknown> {
    const {args} = await this.parse(RolesDelete)
    const id = await this.resolveRoleId(args.role)
    await this.api.delete(`/cli/v1/roles/${id}`)

    if (!this.jsonEnabled()) {
      this.log(`Role deleted: ${args.role}`)
    }

    return {deleted: id}
  }
}
