import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class PlatformsUpdate extends BaseCommand {
  static args = {
    platform: Args.string({description: 'Platform id (UUID) or code', required: true}),
  }

  static description = 'Update a platform (relabel, recolor, reorder, activate/deactivate, toggle uptime support)'

  static examples = [
    '<%= config.bin %> platforms update ios --label "iOS / iPadOS"',
    '<%= config.bin %> platforms update web --color indigo --position 1',
    '<%= config.bin %> platforms update legacy --no-active',
    '<%= config.bin %> platforms update web --supports-uptime',
  ]

  static flags = {
    code: Flags.string({description: 'New code'}),
    label: Flags.string({description: 'New label'}),
    color: Flags.string({description: 'Color label'}),
    position: Flags.integer({description: 'Sort position'}),
    active: Flags.boolean({allowNo: true, description: 'Whether the platform is active'}),
    'supports-uptime': Flags.boolean({
      allowNo: true,
      description: 'Whether projects declaring this platform can enable uptime monitoring',
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(PlatformsUpdate)

    const body: Record<string, unknown> = {}
    if (flags.code !== undefined) body.code = flags.code
    if (flags.label !== undefined) body.label = flags.label
    if (flags.color !== undefined) body.color = flags.color
    if (flags.position !== undefined) body.position = flags.position
    if (flags.active !== undefined) body.active = flags.active
    if (flags['supports-uptime'] !== undefined) body.supports_uptime = flags['supports-uptime']

    // The backend resolves the path identifier by id-or-code, so pass it through directly.
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/platforms/${encodeURIComponent(args.platform)}`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Platform updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
