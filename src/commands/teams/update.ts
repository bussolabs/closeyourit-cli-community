import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TeamsUpdate extends BaseCommand {
  static args = {
    team: Args.string({description: 'Team id (UUID) or name', required: true}),
  }

  static description =
    'Update a team. Each given dimension REPLACES the whole set for that dimension; dimensions you omit are left untouched.'

  static examples = [
    '<%= config.bin %> teams update DriverOne --role Client --group DriverOne',
    '<%= config.bin %> teams update DriverOne --name "DriverOne clients"',
  ]

  static flags = {
    color: Flags.string({description: 'Color label'}),
    group: Flags.string({description: 'Group id or name (repeatable; replaces the group scope)', multiple: true}),
    member: Flags.string({description: 'Member account id or email (repeatable; replaces the members)', multiple: true}),
    name: Flags.string({description: 'New name'}),
    project: Flags.string({description: 'Project id or key (repeatable; replaces the project scope)', multiple: true}),
    role: Flags.string({description: 'Role id or name (repeatable; replaces the roles)', multiple: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TeamsUpdate)
    const id = await this.resolveTeamId(args.team)

    // Only the dimensions actually passed go into the body: the backend applies one axis at a time, so
    // --role alone no longer wipes the group/project scope (CYCL-62). An empty list still clears an axis.
    const body: Record<string, unknown> = {}
    if (flags.name !== undefined) body.name = flags.name
    if (flags.color !== undefined) body.color = flags.color
    if (flags.role !== undefined) body.role_ids = await this.resolveAll(flags.role, (v) => this.resolveRoleId(v))
    if (flags.group !== undefined) body.group_ids = await this.resolveAll(flags.group, (v) => this.resolveGroupId(v))
    if (flags.project !== undefined) {
      body.project_ids = await this.resolveAll(flags.project, (v) => this.resolveProjectId(v))
    }

    if (flags.member !== undefined) {
      body.member_ids = await this.resolveAll(flags.member, (v) => this.resolveMemberId(v))
    }

    const res = await this.api.put<Record<string, unknown>>(`/cli/v1/teams/${id}`, body)

    if (!this.jsonEnabled()) {
      const data = res.data ?? {}
      this.log('Team updated:')
      this.log(renderRecord(data))
      for (const field of ['role_ids', 'group_ids', 'project_ids', 'member_ids']) {
        const ids = Array.isArray(data[field]) ? (data[field] as string[]) : []
        this.log(`${field}: ${ids.length > 0 ? ids.join(', ') : '-'}`)
      }
    }

    return res
  }
}
