import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class PlatformsDelete extends BaseCommand {
  static args = {
    platform: Args.string({description: 'Platform id (UUID) or code', required: true}),
  }

  static description = 'Delete a platform (blocked if any project or ticket still references it)'

  static examples = ['<%= config.bin %> platforms delete legacy --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(PlatformsDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm.', {exit: 2})
    }

    // The backend resolves the path identifier by id-or-code, so pass it through directly.
    await this.api.delete(`/cli/v1/platforms/${encodeURIComponent(args.platform)}`)

    if (!this.jsonEnabled()) this.log(`Deleted platform ${args.platform}`)

    return {deleted: args.platform}
  }
}
