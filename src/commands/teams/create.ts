import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TeamsCreate extends BaseCommand {
  static args = {
    name: Args.string({description: 'Team name', required: true}),
  }

  static description = 'Create a team and (optionally) set its roles, group/project scope and members'

  static examples = [
    '<%= config.bin %> teams create DriverOne --role Client --group DriverOne',
    '<%= config.bin %> teams create DriverOne --role Client --group DriverOne --member client@acme.com',
  ]

  static flags = {
    color: Flags.string({description: 'Color label'}),
    group: Flags.string({description: 'Group id or name to scope the team to (repeatable)', multiple: true}),
    member: Flags.string({description: 'Member account id or email (repeatable; must be an org member)', multiple: true}),
    project: Flags.string({description: 'Project id or key to scope the team to (repeatable)', multiple: true}),
    role: Flags.string({description: 'Role id or name to grant to the team (repeatable)', multiple: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TeamsCreate)

    const body: Record<string, unknown> = {name: args.name}
    if (flags.color !== undefined) body.color = flags.color
    if (flags.role !== undefined) body.role_ids = await this.resolveAll(flags.role, (v) => this.resolveRoleId(v))
    if (flags.group !== undefined) body.group_ids = await this.resolveAll(flags.group, (v) => this.resolveGroupId(v))
    if (flags.project !== undefined) {
      body.project_ids = await this.resolveAll(flags.project, (v) => this.resolveProjectId(v))
    }

    if (flags.member !== undefined) {
      body.member_ids = await this.resolveAll(flags.member, (v) => this.resolveMemberId(v))
    }

    const res = await this.api.post<Record<string, unknown>>('/cli/v1/teams', body)

    if (!this.jsonEnabled()) {
      const data = res.data ?? {}
      this.log('Team created:')
      this.log(renderRecord(data))
      for (const field of ['role_ids', 'group_ids', 'project_ids', 'member_ids']) {
        const ids = Array.isArray(data[field]) ? (data[field] as string[]) : []
        this.log(`${field}: ${ids.length > 0 ? ids.join(', ') : '-'}`)
      }
    }

    return res
  }
}
