import {Args, Flags} from '@oclif/core'
import {BaseCommand, pageFlag} from '../../../base'
import {renderTable} from '../../../lib/output'

export default class MatrixFeaturesList extends BaseCommand {
  static args = {
    product: Args.string({description: 'Product id (UUID) or group name', required: true}),
  }

  static description = 'List the features of a product matrix'

  static examples = [
    '<%= config.bin %> matrix features list CloseYourIt',
    '<%= config.bin %> matrix features list CloseYourIt --category Auth',
  ]

  static flags = {
    ...pageFlag,
    category: Flags.string({description: 'Only the features of this category (id or name)'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MatrixFeaturesList)
    const productId = await this.resolveGroupId(args.product)
    const query = flags.category ? `&category=${encodeURIComponent(flags.category)}` : ''
    const res = await this.api.get<Array<Record<string, unknown>>>(
      `/cli/v1/product/matrix/${encodeURIComponent(productId)}/features?page=${flags.page}${query}`,
    )

    if (!this.jsonEnabled()) {
      // REFERENCE is the `Category/Name` form every other matrix command accepts.
      this.log(
        renderTable(
          ['REFERENCE', 'DESCRIPTION', 'ID'],
          (res.data ?? []).map((feature) => [
            `${String(feature.category_name ?? '')}/${String(feature.name ?? '')}`,
            String(feature.description ?? ''),
            String(feature.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
