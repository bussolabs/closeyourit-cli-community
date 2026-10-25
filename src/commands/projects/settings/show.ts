import {BaseCommand, projectFlag} from '../../../base'
import {renderRecord} from '../../../lib/output'

export default class ProjectsSettingsShow extends BaseCommand {
  static description = 'Show a project settings (log/analytics retention + feature flags)'

  static examples = [
    '<%= config.bin %> projects settings show --project legalbloom-rails',
    '<%= config.bin %> projects settings show -p LBRA',
  ]

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ProjectsSettingsShow)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Record<string, unknown>>(`/cli/v1/projects/${projectId}/settings`)

    if (!this.jsonEnabled()) {
      this.log('Project settings:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
