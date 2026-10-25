import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class ProjectsGithub extends BaseCommand {
  static description = 'Show a project GitHub integration (repo link + tag→release binding rules)'

  static examples = [
    '<%= config.bin %> projects github --project legalbloom-rails',
    '<%= config.bin %> projects github -p LBRA',
    '<%= config.bin %> projects github -p LBRA --json',
  ]

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ProjectsGithub)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Record<string, unknown>>(`/cli/v1/projects/${encodeURIComponent(projectId)}/github`)

    if (!this.jsonEnabled()) {
      const data = res.data ?? {}
      // Flatten the repository block into a single record: unset fields render as `-` when not connected.
      const repo = (data.repository ?? {}) as Record<string, unknown>
      this.log('GitHub integration:')
      this.log(
        renderRecord({
          project_id: data.project_id,
          installed: data.installed,
          connected: data.connected,
          full_name: repo.full_name,
          default_branch: repo.default_branch,
          sync_enabled: repo.sync_enabled,
          sync_secrets: repo.sync_secrets,
          tag_binding_enabled: repo.tag_binding_enabled,
          autoclose_on_merge: repo.autoclose_on_merge,
          production_environment_id: repo.production_environment_id,
          staging_environment_id: repo.staging_environment_id,
        }),
      )
    }

    return res
  }
}
