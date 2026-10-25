import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderTable} from '../../lib/output'

type Repository = {
  default_branch?: string
  full_name?: string
}

type GithubProjectMapping = {
  project_id?: string
  project_key?: string
  project_name?: string
  repository?: Repository | null
}

export default class ProjectsGithubMap extends BaseCommand {
  static description = 'List the project → GitHub repository mapping for local automation'

  static examples = [
    '<%= config.bin %> projects github-map',
    '<%= config.bin %> projects github-map --connected-only',
    '<%= config.bin %> projects github-map --connected-only --json',
  ]

  static flags = {
    'connected-only': Flags.boolean({description: 'Show only projects connected to a GitHub repository'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ProjectsGithubMap)
    const mappings: GithubProjectMapping[] = []
    let page = 1
    let totalPages = 1

    do {
      const params = new URLSearchParams({page: String(page), per: '100'})
      if (flags['connected-only']) params.set('connected_only', 'true')
      // eslint-disable-next-line no-await-in-loop
      const response = await this.api.get<GithubProjectMapping[]>(`/cli/v1/projects/github-map?${params.toString()}`)
      mappings.push(...(response.data ?? []))
      totalPages = Number(response.meta?.total_pages ?? 1)
      page += 1
    } while (page <= totalPages)

    const result = {data: mappings, meta: {total: mappings.length}}

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['KEY', 'PROJECT', 'REPOSITORY', 'BRANCH', 'CONNECTED'],
          mappings.map((mapping) => [
            String(mapping.project_key ?? ''),
            String(mapping.project_name ?? ''),
            String(mapping.repository?.full_name ?? '-'),
            String(mapping.repository?.default_branch ?? '-'),
            mapping.repository ? 'yes' : 'no',
          ]),
        ),
      )
    }

    return result
  }
}
