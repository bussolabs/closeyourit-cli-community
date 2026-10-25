import {BaseCommand, pageFlag, projectFlag} from '../../base'
import {renderTable} from '../../lib/output'

export default class ReleasesList extends BaseCommand {
  static description = 'List the releases of a project (tracked from CI)'

  static examples = [
    '<%= config.bin %> releases list --project acme-api',
    '<%= config.bin %> releases list -p acme-api --page 2 --json',
  ]

  static flags = {...projectFlag, ...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(ReleasesList)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Array<Record<string, unknown>>>(
      `/cli/v1/projects/${projectId}/releases?page=${flags.page}`,
    )
    const releases = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['VERSION', 'ENVIRONMENT', 'SHA', 'EVENTS', 'ID'],
          releases.map((release) => [
            String(release.version ?? ''),
            String(release.environment ?? ''),
            String(release.sha ?? ''),
            String(release.events_count ?? '0'),
            String(release.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
