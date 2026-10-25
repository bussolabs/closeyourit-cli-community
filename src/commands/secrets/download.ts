import {writePrivateFile} from '../../lib/private-file'

import {Flags} from '@oclif/core'
import {BaseCommand, environmentFlag, projectFlag} from '../../base'

export default class SecretsDownload extends BaseCommand {
  static description = 'Download all secrets of an environment as .env or JSON (to a file or stdout). Values with newlines: use --format json. Prefer `cyi run` to avoid writing plaintext to disk.'

  static examples = [
    '<%= config.bin %> secrets download -p acme-api -e production --out .env',
    '<%= config.bin %> secrets download -p acme-api -e production --format json',
  ]

  static flags = {
    ...projectFlag,
    ...environmentFlag,
    format: Flags.string({default: 'env', description: 'Output format', options: ['env', 'json']}),
    out: Flags.string({description: 'Write to this file instead of stdout'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(SecretsDownload)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Record<string, string>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/secrets/bundle?environment=${encodeURIComponent(flags.environment)}`,
    )

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
        this.log(`Wrote ${Object.keys(map).length} secrets → ${flags.out}`)
        this.warn('The file contains plaintext secrets. Prefer `cyi run` to inject them without touching disk.')
      }
    } else if (!this.jsonEnabled()) {
      this.log(body)
    }

    return {count: Object.keys(map).length, format: flags.format, out: flags.out ?? null}
  }
}
