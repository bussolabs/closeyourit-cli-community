import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class EnvironmentsCreate extends BaseCommand {
  static args = {
    code: Args.string({description: 'Environment code (lowercase, e.g. production)', required: true}),
  }

  static description = 'Create an environment (production, staging, …) in your organization'

  static examples = [
    '<%= config.bin %> environments create production --label Production',
    '<%= config.bin %> environments create staging --label Staging --color amber',
    '<%= config.bin %> environments create staging --label Staging --no-uptime',
  ]

  static flags = {
    label: Flags.string({description: 'Human-readable label', required: true}),
    // Mirrors the member form default (emerald); omit to keep that default.
    color: Flags.string({description: 'Color label', default: 'emerald'}),
    position: Flags.integer({description: 'Sort position'}),
    active: Flags.boolean({description: 'Whether the environment is active', allowNo: true}),
    // Default capabilities projects can enable on this environment (each project can override).
    servers: Flags.boolean({description: 'Servers capability default', allowNo: true}),
    uptime: Flags.boolean({description: 'Uptime capability default', allowNo: true}),
    secrets: Flags.boolean({description: 'Secrets capability default', allowNo: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(EnvironmentsCreate)

    const body: Record<string, unknown> = {code: args.code, label: flags.label, color: flags.color}
    if (flags.position !== undefined) body.position = flags.position
    if (flags.active !== undefined) body.active = flags.active
    if (flags.servers !== undefined) body.servers_enabled = flags.servers
    if (flags.uptime !== undefined) body.uptime_enabled = flags.uptime
    if (flags.secrets !== undefined) body.secrets_enabled = flags.secrets

    const res = await this.api.post<Record<string, unknown>>('/cli/v1/environments', body)

    if (!this.jsonEnabled()) {
      this.log('Environment created:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
