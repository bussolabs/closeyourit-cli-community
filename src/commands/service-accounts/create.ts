import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class ServiceAccountsCreate extends BaseCommand {
  static description = 'Create a service account (AI member, CLI-only)'

  static examples = [
    '<%= config.bin %> service-accounts create --name "Deploy bot" --project CYI --grant-secrets --secret-environment staging',
  ]

  static flags = {
    name: Flags.string({description: 'Display name', required: true}),
    handle: Flags.string({description: 'Handle (a-z, 0-9, underscore); derived from name if omitted'}),
    project: Flags.string({description: 'Grant visibility on a project key/id (repeatable)', multiple: true}),
    group: Flags.string({description: 'Grant visibility on a group name/id (repeatable)', multiple: true}),
    role: Flags.string({description: 'Assign a role name/id (repeatable)', multiple: true}),
    'grant-secrets': Flags.boolean({description: 'Grant read+write secrets on the visible projects', default: false}),
    'secret-environment': Flags.string({
      description: 'Restrict secret access to these environment codes (repeatable; empty = all environments)',
      multiple: true,
    }),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ServiceAccountsCreate)
    const projectIds = await Promise.all((flags.project ?? []).map((value) => this.resolveProjectId(value)))
    const groupIds = await Promise.all((flags.group ?? []).map((value) => this.resolveGroupId(value)))
    const roleIds = await Promise.all((flags.role ?? []).map((value) => this.resolveRoleId(value)))

    const body: Record<string, unknown> = {
      name: flags.name,
      project_ids: projectIds,
      group_ids: groupIds,
      role_ids: roleIds,
      grant_secrets: flags['grant-secrets'],
      secret_environment_codes: flags['secret-environment'] ?? [],
    }
    if (flags.handle) body.handle = flags.handle

    const res = await this.api.post<Record<string, unknown>>('/cli/v1/service/accounts', body)

    if (!this.jsonEnabled()) {
      const id = res.data?.id ?? '<id>'
      this.log(`Created service account ${id} (@${res.data?.handle ?? ''}).`)
      this.log(`Mint a token with: service-accounts tokens create ${id} <name>`)
    }

    return res
  }
}
