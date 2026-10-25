import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class OrgUpdate extends BaseCommand {
  static description = 'Update your organization settings (requires organization.manage)'

  static examples = [
    '<%= config.bin %> org update --name "Acme Inc"',
    '<%= config.bin %> org update --slug acme-inc',
    '<%= config.bin %> org update --projects-view table',
    '<%= config.bin %> org update --logs-retention-days 30 --analytics-retention-days 365',
  ]

  static flags = {
    name: Flags.string({description: 'New organization name'}),
    slug: Flags.string({description: 'New organization slug (lowercase, a-z 0-9 and hyphens)'}),
    'projects-view': Flags.string({description: 'Default projects list view', options: ['cards', 'table']}),
    'logs-retention-days': Flags.integer({description: 'Org-level log retention in days (blank inherits the god default)'}),
    'analytics-retention-days': Flags.integer({
      description: 'Org-level analytics retention in days (blank inherits the god default)',
    }),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(OrgUpdate)

    const body: Record<string, unknown> = {}
    if (flags.name !== undefined) body.name = flags.name
    if (flags.slug !== undefined) body.slug = flags.slug
    if (flags['projects-view'] !== undefined) body.default_projects_view = flags['projects-view']
    if (flags['logs-retention-days'] !== undefined) body.logs_retention_days = flags['logs-retention-days']
    if (flags['analytics-retention-days'] !== undefined) {
      body.analytics_retention_days = flags['analytics-retention-days']
    }

    const res = await this.api.put<Record<string, unknown>>('/cli/v1/organization', body)

    if (!this.jsonEnabled()) {
      this.log('Organization updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
