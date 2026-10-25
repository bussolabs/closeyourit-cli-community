import {BaseCommand, projectFlag} from '../../base'
import {Flags} from '@oclif/core'

interface UsageReporter {
  environment?: string
  kind?: string
  sdk_name?: string
  sdk_version?: string
  first_reported_at?: string
  last_reported_at?: string
  truncated_last_window?: boolean
}

// CYSK-29 — who is sending usage and since when: the answer to "route never called or SDK never
// deployed?". The scanner reads it BEFORE judging any kind; `truncated_last_window` disqualifies
// the kind.
export default class UsageReporters extends BaseCommand {
  static description =
    'List the usage reporters: which SDK is sending usage of each kind, and since when'

  static examples = [
    '<%= config.bin %> usage reporters --project CYRA',
    '<%= config.bin %> usage reporters -p CYRA --kind route',
  ]

  static flags = {
    ...projectFlag,
    kind: Flags.string({description: 'Only this kind (route, job, custom)'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(UsageReporters)
    const projectId = await this.resolveProjectId(flags.project)
    const query = flags.kind ? `?kind=${encodeURIComponent(flags.kind)}` : ''
    const res = await this.api.get<UsageReporter[]>(`/cli/v1/projects/${projectId}/usage/reporters${query}`)

    if (!this.jsonEnabled()) {
      const rows = res.data ?? []
      if (rows.length === 0) {
        this.log('No usage reporter yet: without one, "never seen" only means "SDK not deployed".')
      } else {
        for (const row of rows) {
          this.log(`${row.kind ?? '?'}  ${row.sdk_name ?? '?'}@${row.sdk_version ?? '-'}  since ${row.first_reported_at ?? '-'}  last ${row.last_reported_at ?? '-'}  truncated ${row.truncated_last_window ? 'YES' : 'no'}  (${row.environment ?? '-'})`)
        }
      }
    }

    return res
  }
}
