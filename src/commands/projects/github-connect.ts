import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class ProjectsGithubConnect extends BaseCommand {
  static description = 'Connect a project to a repository available to the organization GitHub App'

  static examples = [
    '<%= config.bin %> projects github-connect -p CYAG --repository bussolabs/closeyourit-agent',
  ]

  static flags = {
    ...projectFlag,
    repository: Flags.string({description: 'GitHub repository as owner/name', required: true}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ProjectsGithubConnect)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/github`,
      {full_name: flags.repository},
    )

    if (!this.jsonEnabled()) {
      const data = res.data ?? {}
      const repository = (data.repository ?? {}) as Record<string, unknown>
      this.log('GitHub repository connected:')
      this.log(renderRecord({project_id: data.project_id, full_name: repository.full_name, default_branch: repository.default_branch}))
    }

    return res
  }
}
