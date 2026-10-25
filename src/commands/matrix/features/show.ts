import {Args} from '@oclif/core'
import {BaseCommand} from '../../../base'
import {renderRecord, renderTable} from '../../../lib/output'

interface Cell {
  platform_id?: string
  platform_code?: string
  status?: {code?: string; label?: string} | null
  release?: {version?: string; project_key?: string} | null
  release_missing?: boolean
}

export default class MatrixFeaturesShow extends BaseCommand {
  static args = {
    product: Args.string({description: 'Product id (UUID) or group name', required: true}),
    feature: Args.string({description: 'Feature id (UUID) or "Category/Name"', required: true}),
  }

  static description = 'Show one feature and the cells written for it'

  static examples = ['<%= config.bin %> matrix features show CloseYourIt "Auth/2FA"']

  async run(): Promise<unknown> {
    const {args} = await this.parse(MatrixFeaturesShow)
    const productId = await this.resolveGroupId(args.product)
    const res = await this.api.get<Record<string, unknown>>(
      `/cli/v1/product/matrix/${encodeURIComponent(productId)}/features/${encodeURIComponent(args.feature)}`,
    )

    if (!this.jsonEnabled()) {
      const {cells, ...feature} = res.data ?? {}
      this.log(renderRecord(feature))
      const rows = (cells as Cell[] | undefined) ?? []
      if (rows.length > 0) {
        this.log('')
        this.log(
          renderTable(
            ['PLATFORM', 'STATUS', 'VERSION'],
            rows.map((cell) => [
              String(cell.platform_code ?? cell.platform_id ?? ''),
              String(cell.status?.code ?? ''),
              cell.release?.version ? String(cell.release.version) : cell.release_missing ? '?' : '-',
            ]),
          ),
        )
      }
    }

    return res
  }
}
