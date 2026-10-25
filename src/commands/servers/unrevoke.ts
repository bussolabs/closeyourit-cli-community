import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class ServersUnrevoke extends BaseCommand {
  static args = {
    id: Args.string({description: 'Server id', required: true}),
  }

  static description = 'Restore a revoked server (its agent can push again)'

  static examples = ['<%= config.bin %> servers unrevoke <server-id>']

  async run(): Promise<unknown> {
    const {args} = await this.parse(ServersUnrevoke)
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/servers/${encodeURIComponent(args.id)}/unrevoke`,
    )

    if (!this.jsonEnabled()) this.log(`Restored server ${args.id}`)

    return res
  }
}
