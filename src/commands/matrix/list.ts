import {BaseCommand, pageFlag} from '../../base'
import {renderTable} from '../../lib/output'

export default class MatrixList extends BaseCommand {
  static description = 'List the products (groups) whose feature matrix you can see'

  static examples = ['<%= config.bin %> matrix list', '<%= config.bin %> matrix list --page 2 --json']

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(MatrixList)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/product/matrix?page=${flags.page}`)

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['NAME', 'ID'],
          (res.data ?? []).map((product) => [String(product.name ?? ''), String(product.id ?? '')]),
        ),
      )
    }

    return res
  }
}
