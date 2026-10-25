import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class ServersRename extends BaseCommand {
  static args = {
    id: Args.string({description: 'Server id', required: true}),
  }

  static description = 'Rename a monitored server (display name only)'

  static examples = ['<%= config.bin %> servers rename <server-id> --name apps-prod']

  static flags = {
    name: Flags.string({description: 'New display name', required: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ServersRename)
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/servers/${encodeURIComponent(args.id)}`,
      {name: flags.name},
    )

    if (!this.jsonEnabled()) this.log(`Renamed server ${args.id} to ${flags.name}`)

    return res
  }
}
