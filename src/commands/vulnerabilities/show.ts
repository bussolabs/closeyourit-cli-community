import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord, section} from '../../lib/output'

/** A nested object of the payload, or `{}` when the field is absent. */
function nested(data: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = data[key]
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export default class VulnerabilitiesShow extends BaseCommand {
  static aliases = ['vulns:show']

  static description = 'Show a single vulnerability: advisory, package, manifest and the fixing version'

  static examples = ['<%= config.bin %> vulnerabilities show <finding-id>']

  static args = {
    id: Args.string({description: 'Vulnerability finding id', required: true}),
  }

  async run(): Promise<unknown> {
    const {args} = await this.parse(VulnerabilitiesShow)
    const res = await this.api.get<Record<string, unknown>>(`/cli/v1/vulnerabilities/${args.id}`)

    if (!this.jsonEnabled()) {
      const data = res.data ?? {}
      // Same blocks the promoted ticket carries: whoever reads either one decides with the same facts.
      this.log(renderRecord(data))
      this.log(section('Project', '📦'))
      this.log(renderRecord(nested(data, 'project')))
      this.log(section('Package', '🧩'))
      this.log(renderRecord({...nested(data, 'package'), manifest: nested(data, 'manifest').path ?? null}))
      this.log(section('Advisory', '🔒'))
      this.log(renderRecord(nested(data, 'advisory')))
    }

    return res
  }
}
