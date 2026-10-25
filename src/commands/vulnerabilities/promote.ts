import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class VulnerabilitiesPromote extends BaseCommand {
  static aliases = ['vulns:promote']

  static description = 'Open a ticket from a vulnerability (automatic promotion only fires on high/critical)'

  static examples = ['<%= config.bin %> vulnerabilities promote <finding-id>']

  static args = {
    id: Args.string({description: 'Vulnerability finding id', required: true}),
  }

  async run(): Promise<unknown> {
    const {args} = await this.parse(VulnerabilitiesPromote)
    // Idempotent server-side: promoting twice returns R422-VULN-001, never a second ticket.
    const res = await this.api.put<Record<string, unknown>>(`/cli/v1/vulnerabilities/${args.id}/promotion`)

    if (!this.jsonEnabled()) {
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
