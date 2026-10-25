import {Args, Flags} from '@oclif/core'

import {BaseCommand, projectFlag} from '../../base'
import {renderReport} from '../../lib/ticket-report'

/**
 * Reads the work report (CYCL-31): without `--version` the current draft, with `--version N` that
 * version from the history — the number is unique per ticket, so no id is needed.
 *
 * A ticket without a report answers `R404-REPORT-001` and the command exits non-zero: a script that
 * expects a report notices it, instead of reading an empty output as "it is there and it is empty".
 */
export default class TicketsReportShow extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static description = 'Show the current work report of a ticket, or a past version with --version'

  static examples = [
    '<%= config.bin %> tickets report-show <ticket-id> --project acme-api',
    '<%= config.bin %> tickets report-show DRFL-3 -p acme-api --version 2',
  ]

  static flags = {
    ...projectFlag,
    version: Flags.integer({description: 'Version number to read instead of the current one'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsReportShow)
    const projectId = await this.resolveProjectId(flags.project)
    const base = `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/report`
    const path = flags.version === undefined ? base : `${base}/versions/${encodeURIComponent(String(flags.version))}`

    const res = await this.api.get<Record<string, unknown>>(path)

    if (!this.jsonEnabled()) {
      this.log(renderReport(res.data ?? {}))
    }

    return res
  }
}
