import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderTable} from '../../lib/output'

interface Cell {
  feature_id?: string
  platform_id?: string
  status?: {code?: string; label?: string; category?: string} | null
  release?: {version?: string; project_key?: string} | null
  release_missing?: boolean
}

interface Feature {
  id?: string
  name?: string
}

interface Category {
  name?: string
  features?: Feature[]
}

interface Matrix {
  product?: {name?: string}
  platforms?: Array<{id?: string; code?: string}>
  categories?: Category[]
  cells?: Cell[]
  missing_release_count?: number
}

export default class MatrixShow extends BaseCommand {
  static args = {
    product: Args.string({description: 'Product id (UUID) or group name', required: true}),
  }

  static description = 'Show a product feature matrix: features in rows, platforms in columns'

  static examples = [
    '<%= config.bin %> matrix show CloseYourIt',
    '<%= config.bin %> matrix show CloseYourIt --json',
  ]

  async run(): Promise<unknown> {
    const {args} = await this.parse(MatrixShow)
    const productId = await this.resolveGroupId(args.product)
    const res = await this.api.get<Matrix>(`/cli/v1/product/matrix/${encodeURIComponent(productId)}`)

    if (!this.jsonEnabled()) this.renderMatrix(res.data ?? {})

    return res
  }

  /**
   * The first column holds `Category/Feature` — the very reference `matrix cells set` and
   * `matrix features` take, so a row can be acted on without a second lookup.
   */
  private renderMatrix(matrix: Matrix): void {
    const platforms = matrix.platforms ?? []
    if (platforms.length === 0) {
      this.log('No platforms yet: declare them on the products projects, or write a cell to open a column.')
    }

    const byCell = new Map<string, Cell>()
    for (const cell of matrix.cells ?? []) byCell.set(`${cell.feature_id}|${cell.platform_id}`, cell)

    const rows: string[][] = []
    for (const category of matrix.categories ?? []) {
      for (const feature of category.features ?? []) {
        rows.push([
          `${category.name ?? ''}/${feature.name ?? ''}`,
          ...platforms.map((platform) => this.renderCell(byCell.get(`${feature.id}|${platform.id}`))),
        ])
      }
    }

    if (rows.length === 0) {
      this.log('No features yet. Add one with: matrix features create <product> --category <name> --name <name>')
      return
    }

    this.log(renderTable(['FEATURE', ...platforms.map((platform) => String(platform.code ?? '').toUpperCase())], rows))

    const missing = Number(matrix.missing_release_count ?? 0)
    if (missing > 0) {
      this.log(`\n${missing} released cell(s) without a version (marked "?"). Set one with matrix cells set --release.`)
    }
  }

  /** `-` = not set (different from an explicit "not applicable" status, which has its own code). */
  private renderCell(cell: Cell | undefined): string {
    if (!cell?.status?.code) return '-'
    if (cell.release?.version) return `${cell.status.code} ${cell.release.version}`

    return cell.release_missing ? `${cell.status.code} ?` : String(cell.status.code)
  }
}
