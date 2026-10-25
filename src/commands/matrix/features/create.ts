import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'
import {renderRecord} from '../../../lib/output'

export default class MatrixFeaturesCreate extends BaseCommand {
  static args = {
    product: Args.string({description: 'Product id (UUID) or group name', required: true}),
  }

  static description = 'Create a feature (a row of the matrix) inside a category'

  static examples = [
    '<%= config.bin %> matrix features create CloseYourIt --category Auth --name "2FA"',
    '<%= config.bin %> matrix features create CloseYourIt --category Auth --name "Apple login" --knowledge-page <page-id>',
  ]

  static flags = {
    category: Flags.string({description: 'Category id (UUID) or name', required: true}),
    name: Flags.string({description: 'Feature name (unique within the category)', required: true}),
    description: Flags.string({description: 'What the feature does'}),
    position: Flags.integer({description: 'Sort position'}),
    'knowledge-page': Flags.string({description: 'Knowledge page id explaining the feature'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MatrixFeaturesCreate)
    const productId = await this.resolveGroupId(args.product)

    const body: Record<string, unknown> = {category: flags.category, name: flags.name}
    if (flags.description !== undefined) body.description = flags.description
    if (flags.position !== undefined) body.position = flags.position
    if (flags['knowledge-page'] !== undefined) body.knowledge_page_id = flags['knowledge-page']

    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/product/matrix/${encodeURIComponent(productId)}/features`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Feature created:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
