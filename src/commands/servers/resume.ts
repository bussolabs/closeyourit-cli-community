import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class ServersResume extends BaseCommand {
  static args = {
    id: Args.string({description: 'Server id', required: true}),
  }

  static description = 'Resume a paused server (back up at the next agent push)'

  static examples = ['<%= config.bin %> servers resume <server-id>']

  async run(): Promise<unknown> {
    const {args} = await this.parse(ServersResume)
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/servers/${encodeURIComponent(args.id)}/resume`,
    )

    if (!this.jsonEnabled()) this.log(`Resumed server ${args.id}`)

    return res
  }
}
