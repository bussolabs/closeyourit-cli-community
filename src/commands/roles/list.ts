import {BaseCommand, pageFlag} from '../../base'
import {renderTable} from '../../lib/output'

export default class RolesList extends BaseCommand {
  static description = 'List the RBAC roles in your organization'

  static examples = ['<%= config.bin %> roles list', '<%= config.bin %> roles list --json']

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(RolesList)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/roles?page=${flags.page}`)
    const roles = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['NAME', 'PERMISSIONS', 'ID'],
          roles.map((role) => [
            String(role.name ?? ''),
            String((Array.isArray(role.permission_keys) ? role.permission_keys : []).length),
            String(role.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
