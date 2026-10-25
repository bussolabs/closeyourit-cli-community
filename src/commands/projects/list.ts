import {BaseCommand, pageFlag} from '../../base'
import {renderTable} from '../../lib/output'

export default class ProjectsList extends BaseCommand {
  static description = 'List the projects visible to you'

  static examples = ['<%= config.bin %> projects list', '<%= config.bin %> projects list --page 2 --json']

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ProjectsList)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/projects?page=${flags.page}`)
    const projects = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['KEY', 'NAME', 'ID'],
          projects.map((project) => [String(project.key ?? ''), String(project.name ?? ''), String(project.id ?? '')]),
        ),
      )
    }

    return res
  }
}
