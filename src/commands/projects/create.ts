import {Args, Flags} from '@oclif/core'
import {BaseCommand, UUID_RE} from '../../base'
import {renderRecord} from '../../lib/output'

export default class ProjectsCreate extends BaseCommand {
  static args = {
    name: Args.string({description: 'Project name', required: true}),
  }

  static description = 'Create a project (optionally inside a group)'

  static examples = [
    '<%= config.bin %> projects create driverone-rails --key DRRA',
    '<%= config.bin %> projects create driverone-rails --group DriverOne --key DRRA',
    '<%= config.bin %> projects create driverone-flutter -g <group-uuid> -k DRFL',
    '<%= config.bin %> projects create acme-api -k ACME --quick-bug-report-enabled',
  ]

  static flags = {
    color: Flags.string({description: 'Color label'}),
    description: Flags.string({description: 'Free-form description'}),
    group: Flags.string({char: 'g', description: 'Group id (UUID) or name to place the project in'}),
    key: Flags.string({
      char: 'k',
      required: true,
      description: 'Project key (uppercase A-Z0-9, max 4 chars, unique per org)',
    }),
    'quick-bug-report-enabled': Flags.boolean({
      allowNo: true,
      description: 'Enable the AI-assisted quick bug report on this project',
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ProjectsCreate)

    const body: Record<string, unknown> = {name: args.name, key: flags.key}
    if (flags.color !== undefined) body.color = flags.color
    if (flags.description !== undefined) body.description = flags.description
    if (flags.group !== undefined) {
      // UUID → group_id; otherwise treat as a group name (resolved server-side within the org).
      if (UUID_RE.test(flags.group)) body.group_id = flags.group
      else body.group_name = flags.group
    }
    if (flags['quick-bug-report-enabled'] !== undefined) body.quick_bug_report_enabled = flags['quick-bug-report-enabled']

    const res = await this.api.post<Record<string, unknown>>('/cli/v1/projects', body)

    if (!this.jsonEnabled()) {
      this.log('Project created:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
