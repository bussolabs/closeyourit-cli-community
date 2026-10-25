import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import {renderTable} from '../../../lib/output'
import {aggregatedMeta, fetchAllPages} from '../../../lib/paginate'

export default class SecretsAssetsList extends BaseCommand {
  static description = 'List encrypted secret files visible to a project (metadata only)'
  static flags = {
    ...projectFlag,
    // Deprecated and ignored: the list now aggregates all pages. Kept so scripts do not break.
    page: Flags.integer({deprecated: true, hidden: true, description: 'Deprecated: the list returns every page'}),
    per: Flags.integer({deprecated: true, hidden: true, description: 'Deprecated: the list returns every page'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(SecretsAssetsList)
    const projectId = await this.resolveProjectId(flags.project)
    const data = await fetchAllPages<Record<string, any>>(this.api, `/cli/v1/projects/${encodeURIComponent(projectId)}/secret_assets`)
    if (!this.jsonEnabled()) this.log(renderTable(['ID', 'NAME', 'TYPE', 'ENV', 'VERSION', 'BYTES'], data.map((a) => [a.id, a.name, a.asset_type, a.environment?.code ?? 'all', a.current_version?.number ?? '', a.current_version?.byte_size ?? ''])))
    return {data, meta: aggregatedMeta(data.length)}
  }
}
