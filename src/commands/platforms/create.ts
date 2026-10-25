import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class PlatformsCreate extends BaseCommand {
  static args = {
    code: Args.string({description: 'Platform code (e.g. "ios", "android", "web")', required: true}),
  }

  static description = 'Create a platform (a device/system your projects run on)'

  static examples = [
    '<%= config.bin %> platforms create ios --label iOS',
    '<%= config.bin %> platforms create android --label Android --color emerald --position 2',
    '<%= config.bin %> platforms create web --label Web --supports-uptime',
  ]

  static flags = {
    label: Flags.string({description: 'Human-readable label', required: true}),
    color: Flags.string({description: 'Color label', default: 'sky'}),
    position: Flags.integer({description: 'Sort position'}),
    active: Flags.boolean({allowNo: true, description: 'Whether the platform is active'}),
    'supports-uptime': Flags.boolean({
      allowNo: true,
      description: 'Whether projects declaring this platform can enable uptime monitoring',
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(PlatformsCreate)

    const body: Record<string, unknown> = {code: args.code, label: flags.label, color: flags.color}
    if (flags.position !== undefined) body.position = flags.position
    if (flags.active !== undefined) body.active = flags.active
    if (flags['supports-uptime'] !== undefined) body.supports_uptime = flags['supports-uptime']

    const res = await this.api.post<Record<string, unknown>>('/cli/v1/platforms', body)

    if (!this.jsonEnabled()) {
      this.log('Platform created:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
