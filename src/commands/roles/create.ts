import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class RolesCreate extends BaseCommand {
  static args = {
    name: Args.string({description: 'Role name', required: true}),
  }

  static description = 'Create an RBAC role (a named bundle of permission keys)'

  static examples = [
    '<%= config.bin %> roles create Client --permission tickets.edit --permission tickets.assign',
  ]

  static flags = {
    color: Flags.string({description: 'Color label'}),
    permission: Flags.string({description: 'Permission key from the catalog (repeatable)', multiple: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(RolesCreate)

    const body: Record<string, unknown> = {name: args.name}
    if (flags.color !== undefined) body.color = flags.color
    if (flags.permission !== undefined) body.permission_keys = flags.permission

    const res = await this.api.post<Record<string, unknown>>('/cli/v1/roles', body)

    if (!this.jsonEnabled()) {
      const data = res.data ?? {}
      this.log('Role created:')
      this.log(renderRecord(data))
      const keys = Array.isArray(data.permission_keys) ? (data.permission_keys as string[]) : []
      this.log(`permissions: ${keys.length > 0 ? keys.join(', ') : '-'}`)
    }

    return res
  }
}
