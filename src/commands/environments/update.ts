import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class EnvironmentsUpdate extends BaseCommand {
  static args = {
    environment: Args.string({description: 'Environment id (UUID) or code', required: true}),
  }

  static description = 'Update an environment (recode, relabel, recolor, reorder, activate/deactivate)'

  static examples = [
    '<%= config.bin %> environments update staging --label "Staging env"',
    '<%= config.bin %> environments update production --color indigo',
    '<%= config.bin %> environments update staging --no-active',
    '<%= config.bin %> environments update staging --no-uptime --servers',
  ]

  static flags = {
    code: Flags.string({description: 'New code (lowercase)'}),
    label: Flags.string({description: 'New label'}),
    color: Flags.string({description: 'Color label'}),
    position: Flags.integer({description: 'Sort position'}),
    active: Flags.boolean({description: 'Whether the environment is active', allowNo: true}),
    // Default capabilities projects can enable on this environment (each project can override).
    servers: Flags.boolean({description: 'Servers capability default', allowNo: true}),
    uptime: Flags.boolean({description: 'Uptime capability default', allowNo: true}),
    secrets: Flags.boolean({description: 'Secrets capability default', allowNo: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(EnvironmentsUpdate)

    const body: Record<string, unknown> = {}
    if (flags.code !== undefined) body.code = flags.code
    if (flags.label !== undefined) body.label = flags.label
    if (flags.color !== undefined) body.color = flags.color
    if (flags.position !== undefined) body.position = flags.position
    if (flags.active !== undefined) body.active = flags.active
    if (flags.servers !== undefined) body.servers_enabled = flags.servers
    if (flags.uptime !== undefined) body.uptime_enabled = flags.uptime
    if (flags.secrets !== undefined) body.secrets_enabled = flags.secrets

    // Identifier (id or code) goes straight in the path — the backend resolves id-or-code.
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/environments/${encodeURIComponent(args.environment)}`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Environment updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
