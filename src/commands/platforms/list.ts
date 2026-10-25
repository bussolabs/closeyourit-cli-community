import {BaseCommand, pageFlag} from '../../base'
import {renderTable} from '../../lib/output'

export default class PlatformsList extends BaseCommand {
  static description = 'List the platforms (devices/systems) in your organization'

  static examples = ['<%= config.bin %> platforms list', '<%= config.bin %> platforms list --page 2 --json']

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(PlatformsList)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/platforms?page=${flags.page}`)
    const platforms = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['CODE', 'LABEL', 'COLOR', 'ACTIVE', 'ID'],
          platforms.map((platform) => [
            String(platform.code ?? ''),
            String(platform.label ?? ''),
            String(platform.color ?? ''),
            String(platform.active ?? ''),
            String(platform.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
