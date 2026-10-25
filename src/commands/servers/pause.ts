import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class ServersPause extends BaseCommand {
  static args = {
    id: Args.string({description: 'Server id', required: true}),
  }

  static description = 'Pause a server (no staleness checks or alerts until resumed)'

  static examples = ['<%= config.bin %> servers pause <server-id>']

  async run(): Promise<unknown> {
    const {args} = await this.parse(ServersPause)
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/servers/${encodeURIComponent(args.id)}/pause`,
    )

    if (!this.jsonEnabled()) this.log(`Paused server ${args.id}`)

    return res
  }
}
