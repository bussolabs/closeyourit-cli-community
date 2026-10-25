import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'

export default class MatrixCellsClear extends BaseCommand {
  static args = {
    product: Args.string({description: 'Product id (UUID) or group name', required: true}),
    feature: Args.string({description: 'Feature id (UUID) or "Category/Name"', required: true}),
    platform: Args.string({description: 'Platform id (UUID) or code (e.g. web, ios)', required: true}),
  }

  /**
   * "Not set" is not the same as "not applicable": the latter is an explicit status you write with
   * `matrix cells set`. Clearing throws away the status and the version, hence --confirm.
   */
  static description = 'Clear a matrix cell: the crossing goes back to "not set"'

  static examples = ['<%= config.bin %> matrix cells clear CloseYourIt "Auth/2FA" web --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm clearing the cell'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MatrixCellsClear)

    if (!flags.confirm) {
      this.error('Refusing to clear without --confirm.', {exit: 2})
    }

    const productId = await this.resolveGroupId(args.product)
    const path =
      `/cli/v1/product/matrix/${encodeURIComponent(productId)}` +
      `/features/${encodeURIComponent(args.feature)}/cells/${encodeURIComponent(args.platform)}`
    await this.api.delete(path)

    if (!this.jsonEnabled()) this.log(`Cleared ${args.feature} on ${args.platform}`)

    return {cleared: {feature: args.feature, platform: args.platform}}
  }
}
