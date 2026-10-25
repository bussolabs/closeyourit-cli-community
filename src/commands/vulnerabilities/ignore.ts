import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class VulnerabilitiesIgnore extends BaseCommand {
  static aliases = ['vulns:ignore']

  static description = 'Ignore a vulnerability: you accept living with the risk'

  static examples = [
    '<%= config.bin %> vulnerabilities ignore <finding-id>',
    '<%= config.bin %> vulnerabilities ignore <finding-id> --note "Not reachable from our code."',
  ]

  static args = {
    id: Args.string({description: 'Vulnerability finding id', required: true}),
  }

  static flags = {
    note: Flags.string({description: 'Why you are keeping it (shown alongside the ignored row)'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(VulnerabilitiesIgnore)
    const res = await this.api.put(`/cli/v1/vulnerabilities/${args.id}/ignore`, {triage_note: flags.note})

    if (!this.jsonEnabled()) {
      // An ignored row never reopens on its own: the next scan won't undo a decision already taken.
      this.log(`Vulnerability ${args.id} ignored.`)
    }

    return res
  }
}
