import {BaseCommand} from '../../base'
import {renderTable} from '../../lib/output'

export default class MatrixStatuses extends BaseCommand {
  static description = 'List the cell statuses of your organization (the codes accepted by matrix cells set)'

  static examples = ['<%= config.bin %> matrix statuses', '<%= config.bin %> matrix statuses --json']

  async run(): Promise<unknown> {
    await this.parse(MatrixStatuses)
    const res = await this.api.get<Array<Record<string, unknown>>>('/cli/v1/types/feature_statuses')

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['CODE', 'LABEL', 'LIFECYCLE', 'ID'],
          (res.data ?? []).map((status) => [
            String(status.code ?? ''),
            String(status.label ?? ''),
            String(status.category ?? ''),
            String(status.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
