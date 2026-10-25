import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'

export default class MatrixCategoriesDelete extends BaseCommand {
  static args = {
    product: Args.string({description: 'Product id (UUID) or group name', required: true}),
    category: Args.string({description: 'Category id (UUID) or name', required: true}),
  }

  static description = 'Delete a feature group (only when empty: move or delete its features first)'

  static examples = ['<%= config.bin %> matrix categories delete CloseYourIt Auth --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MatrixCategoriesDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm.', {exit: 2})
    }

    const productId = await this.resolveGroupId(args.product)
    await this.api.delete(
      `/cli/v1/product/matrix/${encodeURIComponent(productId)}/categories/${encodeURIComponent(args.category)}`,
    )

    if (!this.jsonEnabled()) this.log(`Deleted category ${args.category}`)

    return {deleted: args.category}
  }
}
