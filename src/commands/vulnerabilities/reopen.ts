import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class VulnerabilitiesReopen extends BaseCommand {
  static aliases = ['vulns:reopen']

  static description = 'Reopen an ignored vulnerability: you changed your mind'

  static examples = ['<%= config.bin %> vulnerabilities reopen <finding-id>']

  static args = {
    id: Args.string({description: 'Vulnerability finding id', required: true}),
  }

  async run(): Promise<unknown> {
    const {args} = await this.parse(VulnerabilitiesReopen)
    // Reopening is deleting the ignore, not a verb of its own — hence DELETE on the same resource.
    const res = await this.api.delete(`/cli/v1/vulnerabilities/${args.id}/ignore`)

    if (!this.jsonEnabled()) {
      this.log(`Vulnerability ${args.id} reopened.`)
    }

    return res
  }
}
