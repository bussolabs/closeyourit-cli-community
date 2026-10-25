import {readFile} from 'node:fs/promises'

import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {readStream} from '../../lib/stdin'
// Reuse the exact env/JSON parsers from the project-secrets twin so the two vaults never diverge.
import {parseEnv, parseJson} from '../secrets/import'

export default class PersonalImport extends BaseCommand {
  static description = 'Import many personal secrets at once (all-or-nothing) from a .env or JSON file'

  static examples = [
    '<%= config.bin %> personal import --from-file .env',
    '<%= config.bin %> personal import --format json --from-file secrets.json',
    'printf \'{"API_KEY":"value"}\' | <%= config.bin %> personal import --format json',
  ]

  static flags = {
    'from-file': Flags.string({description: 'Path to a .env or JSON file (default: read from stdin)'}),
    format: Flags.string({default: 'env', description: 'Input format', options: ['env', 'json']}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(PersonalImport)

    let text: string
    if (flags['from-file']) {
      text = await readFile(flags['from-file'], 'utf8')
    } else {
      if (process.stdin.isTTY) {
        this.error('Provide --from-file or pipe JSON/ENV input via stdin (e.g. `printf \'{"API_KEY":"value"}\' | cyi personal import --format json`)', {exit: 1})
      }

      text = await readStream()
    }

    const variables = flags.format === 'json' ? parseJson(text) : parseEnv(text)
    if (variables.length === 0) {
      this.error('No variables found in the input', {exit: 1})
    }

    const res = await this.api.post<{imported?: number}>('/cli/v1/personal_secrets/import', {variables})

    if (!this.jsonEnabled()) {
      this.log(`Imported ${res.data?.imported ?? variables.length} personal secrets.`)
    }

    return res
  }
}
