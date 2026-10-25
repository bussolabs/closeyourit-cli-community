import {Args} from '@oclif/core'
import {BaseCommand, pageFlag} from '../../../base'
import {renderTable} from '../../../lib/output'

export default class MatrixCategoriesList extends BaseCommand {
  static args = {
    product: Args.string({description: 'Product id (UUID) or group name', required: true}),
  }

  static description = 'List the feature groups (categories) of a product matrix'

  static examples = ['<%= config.bin %> matrix categories list CloseYourIt']

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MatrixCategoriesList)
    const productId = await this.resolveGroupId(args.product)
    const res = await this.api.get<Array<Record<string, unknown>>>(
      `/cli/v1/product/matrix/${encodeURIComponent(productId)}/categories?page=${flags.page}`,
    )

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['NAME', 'POSITION', 'ID'],
          (res.data ?? []).map((category) => [
            String(category.name ?? ''),
            String(category.position ?? ''),
            String(category.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
