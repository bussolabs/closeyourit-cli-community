import {BaseCommand} from '../../../base'
import {renderTable} from '../../../lib/output'
import {aggregatedMeta, fetchAllPages} from '../../../lib/paginate'

export default class SecretsAssetsSharedList extends BaseCommand {
  static description = 'List organization-level encrypted secret files and delegated projects'
  async run(): Promise<unknown> {
    await this.parse(SecretsAssetsSharedList)
    const data = await fetchAllPages<Record<string, any>>(this.api, '/cli/v1/shared_secret_assets')
    if (!this.jsonEnabled()) this.log(renderTable(['ID', 'NAME', 'TYPE', 'ENV'], data.map((a) => [a.id, a.name, a.asset_type, a.environment?.code ?? 'all'])))
    return {data, meta: aggregatedMeta(data.length)}
  }
}
