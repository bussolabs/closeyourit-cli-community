import {readFile} from 'node:fs/promises'

import {Flags} from '@oclif/core'
import {BaseCommand, environmentFlag, projectFlag} from '../../base'
import {readStream} from '../../lib/stdin'

interface Entry {
  name: string
  value: string
  description?: string
}

/** Parse a .env text into entries: `KEY=VALUE` lines, skipping blanks and `#` comments. */
export function parseEnv(text: string): Entry[] {
  const entries: Entry[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.length === 0 || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    entries.push({name: line.slice(0, eq).trim(), value: line.slice(eq + 1)})
  }

  return entries
}

/** Parse JSON: either `{ "NAME": "value" }` or `[{ "name", "value", "description" }]`. */
export function parseJson(text: string): Entry[] {
  const data = JSON.parse(text) as unknown
  if (Array.isArray(data)) {
    return data.map((row) => {
      const item = row as Record<string, unknown>
      return {name: String(item.name ?? ''), value: String(item.value ?? ''), description: item.description as string | undefined}
    })
  }

  return Object.entries(data as Record<string, unknown>).map(([name, value]) => ({name, value: String(value)}))
}

export default class SecretsImport extends BaseCommand {
  static description = 'Import many secrets at once (all-or-nothing) from a .env or JSON file'

  static examples = [
    '<%= config.bin %> secrets import -p acme-api -e production --from-file .env',
    '<%= config.bin %> secrets import -p acme-api -e production --format json --from-file secrets.json',
    'printf \'{"API_KEY":"value"}\' | <%= config.bin %> secrets import -p acme-api -e development --format json',
  ]

  static flags = {
    ...projectFlag,
    ...environmentFlag,
    'from-file': Flags.string({description: 'Path to a .env or JSON file (default: read from stdin)'}),
    format: Flags.string({default: 'env', description: 'Input format', options: ['env', 'json']}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(SecretsImport)
    const projectId = await this.resolveProjectId(flags.project)

    let text: string
    if (flags['from-file']) {
      text = await readFile(flags['from-file'], 'utf8')
    } else {
      if (process.stdin.isTTY) {
        this.error('Provide --from-file or pipe JSON/ENV input via stdin (e.g. `printf \'{"API_KEY":"value"}\' | cyi secrets import -p acme-api -e development --format json`)', {exit: 1})
      }

      text = await readStream()
    }

    const variables = flags.format === 'json' ? parseJson(text) : parseEnv(text)
    if (variables.length === 0) {
      this.error('No variables found in the input', {exit: 1})
    }

    const res = await this.api.post<{imported?: number}>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/secrets/import`,
      {environment: flags.environment, variables},
    )

    if (!this.jsonEnabled()) {
      this.log(`Imported ${res.data?.imported ?? variables.length} secrets (${flags.environment}).`)
    }

    return res
  }
}
