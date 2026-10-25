import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderTable} from '../../lib/output'
import {aggregatedMeta, fetchAllPages} from '../../lib/paginate'

export default class SecretsList extends BaseCommand {
  static description = 'List secret names for a project (optionally filtered by environment). Lists every secret — never truncated to a page — and never prints values.'

  static examples = [
    '<%= config.bin %> secrets list -p acme-api',
    '<%= config.bin %> secrets list -p acme-api -e production',
    '<%= config.bin %> secrets list -p acme-api --all',
  ]

  static flags = {
    ...projectFlag,
    environment: Flags.string({char: 'e', description: 'Filter by environment code or id'}),
    // The list already aggregates all pages: --all is the explicit affordance requested by the ticket
    // (CYCL-5) to "see all secrets beyond the first 10" with no doubt that the list is complete.
    all: Flags.boolean({char: 'a', description: 'List every secret across all pages (already the default; makes the intent explicit)'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(SecretsList)
    const projectId = await this.resolveProjectId(flags.project)
    const params: Record<string, string> = flags.environment ? {environment: flags.environment} : {}
    const data = await fetchAllPages(this.api, `/cli/v1/projects/${encodeURIComponent(projectId)}/secrets`, params)

    if (!this.jsonEnabled()) {
      const rows = data.map((secret) => [
        String(secret.name ?? ''),
        String((secret.environment as {code?: string} | undefined)?.code ?? ''),
        String(secret.description ?? ''),
      ])
      this.log(renderTable(['NAME', 'ENVIRONMENT', 'DESCRIPTION'], rows))
    }

    return {data, meta: aggregatedMeta(data.length)}
  }
}
