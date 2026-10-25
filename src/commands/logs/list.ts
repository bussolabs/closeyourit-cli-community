import {Flags} from '@oclif/core'
import {BaseCommand, pageFlag} from '../../base'
import {renderTable} from '../../lib/output'

/** Collapse whitespace (log messages may be multi-line) and truncate so the table stays single-line. */
function oneLine(value: string, max = 80): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export default class LogsList extends BaseCommand {
  static description = 'List structured log entries (cross-app stream)'

  static examples = [
    '<%= config.bin %> logs list',
    '<%= config.bin %> logs list --project acme-api --level error',
    '<%= config.bin %> logs list --trace-id 7f3c… --json',
  ]

  static flags = {
    // Optional here (the endpoint is cross-app): without it, the stream spans every visible project.
    project: Flags.string({char: 'p', description: 'Filter by project id (UUID) or key'}),
    level: Flags.string({description: 'Filter by level (debug, info, warning, error, fatal)'}),
    'trace-id': Flags.string({description: 'Filter by trace id (correlate one request)'}),
    environment: Flags.string({description: 'Filter by environment (e.g. production)'}),
    ...pageFlag,
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(LogsList)

    const query = new URLSearchParams({page: String(flags.page)})
    if (flags.project) query.set('project_id', await this.resolveProjectId(flags.project))
    if (flags.level) query.set('level', flags.level)
    if (flags['trace-id']) query.set('trace_id', flags['trace-id'])
    if (flags.environment) query.set('environment', flags.environment)

    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/log_entries?${query.toString()}`)
    const entries = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['OCCURRED_AT', 'LEVEL', 'ENV', 'LOGGER', 'MESSAGE'],
          entries.map((entry) => [
            String(entry.occurred_at ?? ''),
            String(entry.level ?? ''),
            String(entry.environment ?? ''),
            String(entry.logger ?? ''),
            oneLine(String(entry.message ?? '')),
          ]),
        ),
      )
    }

    return res
  }
}
