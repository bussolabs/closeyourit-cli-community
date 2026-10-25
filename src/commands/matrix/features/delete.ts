import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'

export default class MatrixFeaturesDelete extends BaseCommand {
  static args = {
    product: Args.string({description: 'Product id (UUID) or group name', required: true}),
    feature: Args.string({description: 'Feature id (UUID) or "Category/Name"', required: true}),
  }

  static description = 'Delete a feature and every cell written for it (irreversible)'

  static examples = ['<%= config.bin %> matrix features delete CloseYourIt "Auth/2FA" --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MatrixFeaturesDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm.', {exit: 2})
    }

    const productId = await this.resolveGroupId(args.product)
    await this.api.delete(
      `/cli/v1/product/matrix/${encodeURIComponent(productId)}/features/${encodeURIComponent(args.feature)}`,
    )

    if (!this.jsonEnabled()) this.log(`Deleted feature ${args.feature}`)

    return {deleted: args.feature}
  }
}
