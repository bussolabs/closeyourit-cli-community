import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'

interface Cell {
  platform_code?: string
  status?: {code?: string; label?: string} | null
  release?: {version?: string} | null
  release_missing?: boolean
}

export default class MatrixCellsSet extends BaseCommand {
  static args = {
    product: Args.string({description: 'Product id (UUID) or group name', required: true}),
    feature: Args.string({description: 'Feature id (UUID) or "Category/Name"', required: true}),
    platform: Args.string({description: 'Platform id (UUID) or code (e.g. web, ios)', required: true}),
  }

  static description = 'Write a matrix cell: how far along a feature is on a platform, and since which version'

  static examples = [
    '<%= config.bin %> matrix cells set CloseYourIt "Auth/2FA" web --status available --release 2.1.0',
    '<%= config.bin %> matrix cells set CloseYourIt "Auth/2FA" ios --status planned',
  ]

  static flags = {
    status: Flags.string({description: 'Status code (see: matrix statuses) or id', required: true}),
    release: Flags.string({
      description: 'Version the feature became available in (a registered release of the product on that platform)',
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MatrixCellsSet)
    const productId = await this.resolveGroupId(args.product)

    const body: Record<string, unknown> = {status: flags.status}
    if (flags.release !== undefined) body.release = flags.release

    const path =
      `/cli/v1/product/matrix/${encodeURIComponent(productId)}` +
      `/features/${encodeURIComponent(args.feature)}/cells/${encodeURIComponent(args.platform)}`
    const res = await this.api.put<Cell>(path, body)

    if (!this.jsonEnabled()) {
      // What was saved, in the words the command took: status and release are nested objects, so a
      // flat record dump would drop exactly the two values the user just set.
      const cell = res.data ?? {}
      const where = cell.platform_code ?? args.platform
      const version = cell.release?.version ?? (cell.release_missing ? 'no version set' : 'no version')
      this.log(`Saved: ${args.feature} on ${where} → ${cell.status?.code ?? flags.status} (${version})`)
    }

    return res
  }
}
