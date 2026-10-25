import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'
import {renderRecord} from '../../../lib/output'

export default class MatrixCategoriesCreate extends BaseCommand {
  static args = {
    product: Args.string({description: 'Product id (UUID) or group name', required: true}),
  }

  static description = 'Create a feature group (category) in a product matrix'

  static examples = [
    '<%= config.bin %> matrix categories create CloseYourIt --name Auth',
    '<%= config.bin %> matrix categories create CloseYourIt --name Notifications --position 2',
  ]

  static flags = {
    name: Flags.string({description: 'Category name (unique within the product)', required: true}),
    position: Flags.integer({description: 'Sort position'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MatrixCategoriesCreate)
    const productId = await this.resolveGroupId(args.product)

    const body: Record<string, unknown> = {name: flags.name}
    if (flags.position !== undefined) body.position = flags.position

    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/product/matrix/${encodeURIComponent(productId)}/categories`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Category created:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
