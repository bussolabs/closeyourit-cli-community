import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'
import {renderRecord} from '../../../lib/output'

export default class MatrixCategoriesUpdate extends BaseCommand {
  static args = {
    product: Args.string({description: 'Product id (UUID) or group name', required: true}),
    category: Args.string({description: 'Category id (UUID) or name', required: true}),
  }

  static description = 'Update a feature group (rename or reorder); unpassed fields keep their value'

  static examples = [
    '<%= config.bin %> matrix categories update CloseYourIt Auth --name "Access"',
    '<%= config.bin %> matrix categories update CloseYourIt Auth --position 1',
  ]

  static flags = {
    name: Flags.string({description: 'New name'}),
    position: Flags.integer({description: 'Sort position'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MatrixCategoriesUpdate)
    const productId = await this.resolveGroupId(args.product)

    const body: Record<string, unknown> = {}
    if (flags.name !== undefined) body.name = flags.name
    if (flags.position !== undefined) body.position = flags.position

    // The backend resolves the category by id-or-name within the product, so pass it through.
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/product/matrix/${encodeURIComponent(productId)}/categories/${encodeURIComponent(args.category)}`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Category updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
