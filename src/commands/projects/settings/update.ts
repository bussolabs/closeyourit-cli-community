import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import {renderRecord} from '../../../lib/output'

export default class ProjectsSettingsUpdate extends BaseCommand {
  static description = 'Update a project settings (log/analytics retention + feature flags); only the passed fields change'

  static examples = [
    '<%= config.bin %> projects settings update --project LBRA --logs-retention-days 30',
    '<%= config.bin %> projects settings update -p LBRA --analytics-retention-days 365 --analytics-enabled',
    '<%= config.bin %> projects settings update -p LBRA --no-quick-bug-report-enabled',
  ]

  static flags = {
    ...projectFlag,
    'logs-retention-days': Flags.integer({description: 'Log retention in days (blank inherits the org/global default)'}),
    'analytics-retention-days': Flags.integer({
      description: 'Analytics retention in days (blank inherits the org/global default)',
    }),
    'quick-bug-report-enabled': Flags.boolean({
      allowNo: true,
      description: 'Enable/disable the AI-assisted quick bug report',
    }),
    'analytics-enabled': Flags.boolean({allowNo: true, description: 'Enable/disable web analytics ingestion'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ProjectsSettingsUpdate)
    const projectId = await this.resolveProjectId(flags.project)

    const body: Record<string, unknown> = {}
    if (flags['logs-retention-days'] !== undefined) body.logs_retention_days = flags['logs-retention-days']
    if (flags['analytics-retention-days'] !== undefined) body.analytics_retention_days = flags['analytics-retention-days']
    if (flags['quick-bug-report-enabled'] !== undefined) body.quick_bug_report_enabled = flags['quick-bug-report-enabled']
    if (flags['analytics-enabled'] !== undefined) body.analytics_enabled = flags['analytics-enabled']

    // The settings action responds to both PATCH and PUT (Rails singleton `resource` update); the CLI
    // transport speaks PUT — the backend applies only the keys present in the body either way.
    const res = await this.api.put<Record<string, unknown>>(`/cli/v1/projects/${projectId}/settings`, body)

    if (!this.jsonEnabled()) {
      this.log('Project settings updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
