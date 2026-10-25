import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'

export default class AgentsTokensRevoke extends BaseCommand {
  static args = {
    id: Args.string({description: 'Automator token id', required: true}),
  }

  static description = 'Revoke an org automator token (the automator using it stops syncing)'

  static examples = ['<%= config.bin %> agents tokens revoke <token-id> --confirm']

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the revocation'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(AgentsTokensRevoke)

    if (!flags.confirm) {
      this.error('Refusing to revoke without --confirm.', {exit: 2})
    }

    await this.api.delete(`/cli/v1/agents/tokens/${encodeURIComponent(args.id)}`)

    if (!this.jsonEnabled()) this.log(`Revoked automator token ${args.id}`)

    return {revoked: args.id}
  }
}
