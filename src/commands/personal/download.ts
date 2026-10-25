import {writePrivateFile} from '../../lib/private-file'

import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class PersonalDownload extends BaseCommand {
  static description = 'Download all your personal secrets as .env or JSON (to a file or stdout). Values with newlines: use --format json. Prefer `cyi personal run` to avoid writing plaintext to disk.'

  static examples = [
    '<%= config.bin %> personal download --out .env',
    '<%= config.bin %> personal download --format json',
  ]

  static flags = {
    format: Flags.string({default: 'env', description: 'Output format', options: ['env', 'json']}),
    out: Flags.string({description: 'Write to this file instead of stdout'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(PersonalDownload)
    const res = await this.api.get<Record<string, string>>('/cli/v1/personal_secrets/bundle')

    const map = res.data ?? {}
    const body =
      flags.format === 'json'
        ? JSON.stringify(map, null, 2)
        : Object.entries(map)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n')

    if (flags.out) {
      await writePrivateFile(flags.out, `${body}\n`)
      if (!this.jsonEnabled()) {
        this.log(`Wrote ${Object.keys(map).length} personal secrets → ${flags.out}`)
        this.warn('The file contains plaintext secrets. Prefer `cyi personal run` to inject them without touching disk.')
      }
    } else if (!this.jsonEnabled()) {
      this.log(body)
    }

    return {count: Object.keys(map).length, format: flags.format, out: flags.out ?? null}
  }
}
