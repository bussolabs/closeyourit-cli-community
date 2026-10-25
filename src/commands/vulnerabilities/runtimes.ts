import {Flags} from '@oclif/core'
import {BaseCommand, pageFlag} from '../../base'
import {renderTable, statusCell} from '../../lib/output'

type Runtime = Record<string, unknown> & {project?: Record<string, unknown>}

export default class VulnerabilitiesRuntimes extends BaseCommand {
  static aliases = ['vulns:runtimes']

  static description = 'List the support state of the declared runtimes (Ruby, Node, Flutter…)'

  static examples = [
    '<%= config.bin %> vulnerabilities runtimes',
    '<%= config.bin %> vulnerabilities runtimes --project acme-api --json',
  ]

  static flags = {
    project: Flags.string({char: 'p', description: 'Filter by project id (UUID) or key'}),
    ...pageFlag,
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(VulnerabilitiesRuntimes)

    const query = new URLSearchParams({page: String(flags.page)})
    if (flags.project) query.set('project_id', await this.resolveProjectId(flags.project))

    const res = await this.api.get<Runtime[]>(`/cli/v1/vulnerabilities/runtimes?${query.toString()}`)
    const runtimes = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['PROJECT', 'RUNTIME', 'VERSION', 'STATE', 'EOL', 'LATEST'],
          runtimes.map((runtime) => [
            String(runtime.project?.key ?? ''),
            String(runtime.name ?? ''),
            String(runtime.version ?? ''),
            statusCell(runtime.state),
            // No EOL date means endoflife.date doesn't know the product: no alarm is possible.
            String(runtime.eol_on ?? '—'),
            String(runtime.latest ?? '—'),
          ]),
        ),
      )
    }

    return res
  }
}
