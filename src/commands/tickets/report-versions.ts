import {Args} from '@oclif/core'

import {BaseCommand, pageFlag, projectFlag} from '../../base'
import {charCount} from '../../lib/limits'
import {renderTable} from '../../lib/output'

/**
 * History of the work report (CYCL-31), newest to oldest. The table carries the metadata and the
 * LENGTH of each draft, not the text: the bodies are thousands of characters long and putting them
 * in columns would make the list unreadable. A version's text is read with
 * `tickets report-show --version N`.
 */
export default class TicketsReportVersions extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static description = 'List the versions of the work report of a ticket (newest first)'

  static examples = [
    '<%= config.bin %> tickets report-versions <ticket-id> --project acme-api',
    '<%= config.bin %> tickets report-versions DRFL-3 -p acme-api --page 2 --json',
  ]

  static flags = {...projectFlag, ...pageFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsReportVersions)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Array<Record<string, unknown>>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/report/versions?page=${flags.page}`,
    )
    const versions = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['VERSION', 'AUTHOR', 'SOURCE', 'CHARS', 'CREATED_AT'],
          versions.map((version) => [
            String(version.version ?? ''),
            String(version.author ?? '-'),
            String(version.source ?? '-'),
            String(charCount(version.body)),
            String(version.created_at ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
