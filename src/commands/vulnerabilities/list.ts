import {Flags} from '@oclif/core'
import {BaseCommand, pageFlag} from '../../base'
import {renderTable, statusCell} from '../../lib/output'

/** The nested objects the finding serializer ships; read defensively (a field may be absent). */
type Finding = Record<string, unknown> & {
  advisory?: Record<string, unknown>
  package?: Record<string, unknown>
  project?: Record<string, unknown>
}

export default class VulnerabilitiesList extends BaseCommand {
  static aliases = ['vulns:list']

  static description = 'List known vulnerabilities of the project dependencies (cross-project)'

  static examples = [
    '<%= config.bin %> vulnerabilities list',
    '<%= config.bin %> vulnerabilities list --severity critical',
    '<%= config.bin %> vulnerabilities list --project acme-api --status open',
    '<%= config.bin %> vulnerabilities list --package nokogiri --json',
  ]

  static flags = {
    // Optional here (the endpoint is cross-project): without it, the list spans every visible project.
    project: Flags.string({char: 'p', description: 'Filter by project id (UUID) or key'}),
    severity: Flags.string({description: 'Filter by severity (critical, high, moderate, low, unknown)'}),
    status: Flags.string({description: 'Filter by status (open, resolved, ignored)'}),
    package: Flags.string({description: 'Filter by package name (partial match)'}),
    ...pageFlag,
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(VulnerabilitiesList)

    const query = new URLSearchParams({page: String(flags.page)})
    if (flags.project) query.set('project_id', await this.resolveProjectId(flags.project))
    if (flags.severity) query.set('severity', flags.severity)
    if (flags.status) query.set('status', flags.status)
    if (flags.package) query.set('package', flags.package)

    const res = await this.api.get<Finding[]>(`/cli/v1/vulnerabilities?${query.toString()}`)
    const findings = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          // ID first, like `errors list`: every other subcommand takes it as its argument, so a table
          // without it forces `--json` just to triage what you are already looking at.
          ['ID', 'PROJECT', 'PACKAGE', 'SEVERITY', 'STATUS', 'FIXED IN', 'ADVISORY'],
          findings.map((finding) => [
            String(finding.id ?? ''),
            String(finding.project?.key ?? ''),
            String(finding.package?.coordinates ?? ''),
            statusCell(finding.advisory?.severity),
            statusCell(finding.status),
            // No fixed version means OSV declares none: the only move is dropping or replacing the dep.
            String(finding.fixed_version ?? '—'),
            String(finding.advisory?.display_id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
