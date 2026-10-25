import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

// CYRA-519 — the names that are NOT services on a machine (build and test containers, which are
// born and die with every job) could only be written from the web page: whoever works from the
// terminal had to open the browser for a two-line list.
//
// Without flags the command reads; --set replaces the list, --clear empties it. It replaces rather
// than appends: a two-name list is rewritten in full, and "add" would need a read first.
export default class ServersIgnoredContainers extends BaseCommand {
  static args = {
    id: Args.string({description: 'Server id', required: true}),
  }

  static description = 'Read or set the container names this server does not treat as services'

  static examples = [
    '<%= config.bin %> servers ignored-containers <server-id>',
    '<%= config.bin %> servers ignored-containers <server-id> --set buildkit,runner',
    '<%= config.bin %> servers ignored-containers <server-id> --clear',
  ]

  static flags = {
    clear: Flags.boolean({description: 'Remove every ignored container name', exclusive: ['set']}),
    set: Flags.string({description: 'Comma-separated names to ignore (replaces the list)'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ServersIgnoredContainers)
    const path = `/cli/v1/servers/${encodeURIComponent(args.id)}`

    if (flags.set === undefined && !flags.clear) {
      const res = await this.api.get<Record<string, unknown>>(path)
      if (!this.jsonEnabled()) this.log(this.render(res.data))
      return res
    }

    const patterns = flags.clear ? [] : this.split(flags.set ?? '')
    const res = await this.api.put<Record<string, unknown>>(path, {ignored_container_patterns: patterns})

    if (!this.jsonEnabled()) this.log(this.render(res.data))

    return res
  }

  private render(data: Record<string, unknown> | undefined): string {
    const patterns = (data?.ignored_container_patterns as string[] | undefined) ?? []
    return patterns.length === 0 ? 'No ignored container names' : patterns.join('\n')
  }

  private split(value: string): string[] {
    return value
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
  }
}
