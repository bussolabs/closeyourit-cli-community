import {BaseCommand} from '../../base'
import {renderTable} from '../../lib/output'
import {aggregatedMeta, fetchAllPages} from '../../lib/paginate'

/**
 * Environment codes carried by a shared-variable row, or `[]` when the payload does not say.
 *
 * A shared variable holds one value per environment, but `SharedSecretVariableSerializer` today
 * ships only `{id, name, description, created_at, updated_at}` — the per-environment matrix is not
 * in the list payload. Read it defensively rather than print an always-empty column: the day the
 * backend adds `environments`, `shared list` shows it without a CLI change (CYCL-41).
 */
function environmentCodes(row: Record<string, unknown>): string[] {
  if (!Array.isArray(row.environments)) return []
  return row.environments
    .map((env) => (env !== null && typeof env === 'object' ? (env as {code?: unknown}).code : env))
    .map((code) => String(code ?? ''))
    .filter(Boolean)
}

export default class SharedList extends BaseCommand {
  static description =
    'List the organization shared secret names (one row per variable, every page). Never prints values.'

  static examples = ['<%= config.bin %> shared list', '<%= config.bin %> shared list --json']

  async run(): Promise<unknown> {
    await this.parse(SharedList)
    const data = await fetchAllPages(this.api, '/cli/v1/shared_secrets')

    if (!this.jsonEnabled()) {
      // ENVIRONMENTS shows up only when at least one row carries it, like the STATUS column of
      // `kb list`: a column of blanks would read as "this variable is on no environment".
      const showEnvironments = data.some((secret) => environmentCodes(secret).length > 0)
      const headers = showEnvironments ? ['NAME', 'ENVIRONMENTS', 'DESCRIPTION', 'UPDATED'] : ['NAME', 'DESCRIPTION', 'UPDATED']
      const rows = data.map((secret) => {
        const row = [String(secret.name ?? '')]
        if (showEnvironments) row.push(environmentCodes(secret).join(', '))
        row.push(String(secret.description ?? ''), String(secret.updated_at ?? ''))
        return row
      })
      this.log(renderTable(headers, rows))
    }

    return {data, meta: aggregatedMeta(data.length)}
  }
}
