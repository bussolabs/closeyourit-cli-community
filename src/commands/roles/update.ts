import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class RolesUpdate extends BaseCommand {
  static args = {
    role: Args.string({description: 'Role id (UUID) or name', required: true}),
  }

  static description = 'Update a role (rename, recolor, or replace its permission keys)'

  static examples = [
    '<%= config.bin %> roles update Client --permission tickets.edit --permission tickets.assign',
    '<%= config.bin %> roles update Client --name "Client manager"',
  ]

  static flags = {
    color: Flags.string({description: 'Color label'}),
    name: Flags.string({description: 'New name'}),
    permission: Flags.string({
      description: 'Permission key (repeatable); when given, REPLACES the whole set',
      multiple: true,
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(RolesUpdate)
    const id = await this.resolveRoleId(args.role)

    const body: Record<string, unknown> = {}
    if (flags.name !== undefined) body.name = flags.name
    if (flags.color !== undefined) body.color = flags.color
    if (flags.permission !== undefined) body.permission_keys = flags.permission

    const res = await this.api.put<Record<string, unknown>>(`/cli/v1/roles/${id}`, body)

    if (!this.jsonEnabled()) {
      const data = res.data ?? {}
      this.log('Role updated:')
      this.log(renderRecord(data))
      const keys = Array.isArray(data.permission_keys) ? (data.permission_keys as string[]) : []
      this.log(`permissions: ${keys.length > 0 ? keys.join(', ') : '-'}`)
    }

    return res
  }
}
