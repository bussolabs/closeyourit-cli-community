import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class RolesShow extends BaseCommand {
  static args = {
    role: Args.string({description: 'Role id (UUID) or name', required: true}),
  }

  static description = 'Show a role by id or name (with its permission keys)'

  static examples = ['<%= config.bin %> roles show Client']

  async run(): Promise<unknown> {
    const {args} = await this.parse(RolesShow)
    const id = await this.resolveRoleId(args.role)
    const res = await this.api.get<Record<string, unknown>>(`/cli/v1/roles/${id}`)

    if (!this.jsonEnabled()) {
      const data = res.data ?? {}
      this.log(renderRecord(data))
      const keys = Array.isArray(data.permission_keys) ? (data.permission_keys as string[]) : []
      this.log(`permissions: ${keys.length > 0 ? keys.join(', ') : '-'}`)
    }

    return res
  }
}
