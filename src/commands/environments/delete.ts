import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class EnvironmentsDelete extends BaseCommand {
  static args = {
    environment: Args.string({description: 'Environment id (UUID) or code', required: true}),
  }

  static description = 'Delete an environment (blocked while projects, tokens or monitors reference it)'

  static examples = ['<%= config.bin %> environments delete staging --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(EnvironmentsDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm.', {exit: 2})
    }

    // Identifier (id or code) goes straight in the path — the backend resolves id-or-code.
    await this.api.delete(`/cli/v1/environments/${encodeURIComponent(args.environment)}`)

    if (!this.jsonEnabled()) this.log(`Deleted environment ${args.environment}`)

    return {deleted: args.environment}
  }
}
