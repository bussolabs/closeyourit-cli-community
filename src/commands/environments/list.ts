import {BaseCommand, pageFlag} from '../../base'
import {renderTable} from '../../lib/output'

export default class EnvironmentsList extends BaseCommand {
  static description = 'List the environments (production, staging, …) in your organization'

  static examples = ['<%= config.bin %> environments list', '<%= config.bin %> environments list --page 2 --json']

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(EnvironmentsList)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/environments?page=${flags.page}`)
    const environments = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['CODE', 'LABEL', 'COLOR', 'ACTIVE', 'ID'],
          environments.map((env) => [
            String(env.code ?? ''),
            String(env.label ?? ''),
            String(env.color ?? ''),
            String(env.active ?? ''),
            String(env.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
