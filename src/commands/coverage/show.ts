import {BaseCommand, projectFlag} from '../../base'
import {Flags} from '@oclif/core'

interface CoverageReport {
  branch?: string
  sha?: string
  captured_at?: string
  line_covered_percent?: string | number
  branch_covered_percent?: string | number
  files_count?: number
  never_loaded_count?: number
  updated_at?: string
}

// CYSK-26 — the coverage extract published by CI, read back without re-running the suite: it is the
// data the unused-code scanner uses to decide whether the measurement is credible before trusting it.
export default class CoverageShow extends BaseCommand {
  static description =
    'Show the coverage extract the CI published for a project (last snapshot per branch, never the history)'

  static examples = [
    '<%= config.bin %> coverage show --project closeyourit-rails',
    '<%= config.bin %> coverage show -p CYRA --branch main',
    '<%= config.bin %> coverage show -p CYRA --json',
  ]

  static flags = {
    ...projectFlag,
    branch: Flags.string({description: 'Only the extract of this branch'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(CoverageShow)
    const projectId = await this.resolveProjectId(flags.project)
    const query = flags.branch ? `?branch=${encodeURIComponent(flags.branch)}` : ''
    const res = await this.api.get<CoverageReport[]>(`/cli/v1/projects/${projectId}/coverage${query}`)

    if (!this.jsonEnabled()) {
      const reports = res.data ?? []
      if (reports.length === 0) {
        this.log('No coverage extract published yet: the CI pushes it from the default branch.')
      } else {
        for (const report of reports) {
          this.log(
            `${report.branch ?? '?'}  line ${report.line_covered_percent ?? '-'}%  branch ${report.branch_covered_percent ?? '-'}%  ` +
            `files ${report.files_count ?? '-'}  never_loaded ${report.never_loaded_count ?? '-'}  ` +
            `sha ${report.sha ?? '-'}  captured ${report.captured_at ?? '-'}`,
          )
        }
      }
    }

    return res
  }
}
