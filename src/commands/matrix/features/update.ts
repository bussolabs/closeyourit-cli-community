import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'
import {renderRecord} from '../../../lib/output'

export default class MatrixFeaturesUpdate extends BaseCommand {
  static args = {
    product: Args.string({description: 'Product id (UUID) or group name', required: true}),
    feature: Args.string({description: 'Feature id (UUID) or "Category/Name"', required: true}),
  }

  static description = 'Update a feature (rename, move to another category, …); unpassed fields keep their value'

  static examples = [
    '<%= config.bin %> matrix features update CloseYourIt "Auth/2FA" --name "Two-factor"',
    '<%= config.bin %> matrix features update CloseYourIt "Auth/2FA" --category Notifications',
  ]

  static flags = {
    name: Flags.string({description: 'New name'}),
    description: Flags.string({description: 'What the feature does'}),
    position: Flags.integer({description: 'Sort position'}),
    category: Flags.string({description: 'Move it to this category (id or name, same product)'}),
    'knowledge-page': Flags.string({description: 'Knowledge page id explaining the feature'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MatrixFeaturesUpdate)
    const productId = await this.resolveGroupId(args.product)

    const body: Record<string, unknown> = {}
    if (flags.name !== undefined) body.name = flags.name
    if (flags.description !== undefined) body.description = flags.description
    if (flags.position !== undefined) body.position = flags.position
    if (flags.category !== undefined) body.category = flags.category
    if (flags['knowledge-page'] !== undefined) body.knowledge_page_id = flags['knowledge-page']

    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/product/matrix/${encodeURIComponent(productId)}/features/${encodeURIComponent(args.feature)}`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Feature updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
