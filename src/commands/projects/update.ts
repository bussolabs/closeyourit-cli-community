import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class ProjectsUpdate extends BaseCommand {
  static description = 'Update a project (name, key, color, description, group, feature flags)'

  static examples = [
    '<%= config.bin %> projects update --project LBRA --name "New name"',
    '<%= config.bin %> projects update -p LBRA --group Backend',
    '<%= config.bin %> projects update -p LBRA --no-quick-bug-report-enabled',
  ]

  static flags = {
    ...projectFlag,
    name: Flags.string({description: 'New project name'}),
    key: Flags.string({description: 'New project key (uppercase A-Z0-9)'}),
    color: Flags.string({description: 'Color label'}),
    description: Flags.string({description: 'Free-form description'}),
    group: Flags.string({description: 'Group id (UUID) or name to move the project into'}),
    'quick-bug-report-enabled': Flags.boolean({
      allowNo: true,
      description: 'Enable/disable the AI-assisted quick bug report on this project',
    }),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ProjectsUpdate)
    const projectId = await this.resolveProjectId(flags.project)

    const body: Record<string, unknown> = {}
    for (const k of ['name', 'key', 'color', 'description'] as const) {
      if (flags[k] !== undefined) body[k] = flags[k]
    }
    if (flags.group !== undefined) body.group_id = await this.resolveGroupId(flags.group)
    if (flags['quick-bug-report-enabled'] !== undefined) body.quick_bug_report_enabled = flags['quick-bug-report-enabled']

    const res = await this.api.put<{key?: string; name?: string}>(`/cli/v1/projects/${projectId}`, body)

    if (!this.jsonEnabled()) {
      const p = res.data ?? {}
      this.log(`Updated project ${p.key ?? projectId}${p.name ? ` — ${p.name}` : ''}`)
    }

    return res
  }
}
