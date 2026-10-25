import {Args} from '@oclif/core'
import {BaseCommand} from '../../../base'

export default class AgentsTokensCreate extends BaseCommand {
  static args = {
    name: Args.string({description: 'Token name (e.g. automator)', required: true}),
  }

  static description = 'Create an org automator token (cyi_a_ — the secret is shown only once)'

  static examples = ['<%= config.bin %> agents tokens create automator']

  async run(): Promise<unknown> {
    const {args} = await this.parse(AgentsTokensCreate)
    const res = await this.api.post<Record<string, unknown>>('/cli/v1/agents/tokens', {name: args.name})
    const token = res.data ?? {}

    if (!this.jsonEnabled()) {
      this.log('Automator token created. Store the secret now — it is shown only once:')
      this.log('')
      this.log(`  secret: ${token.secret ?? '-'}`)
      this.log('')
      this.warn('The secret cannot be retrieved again. If you lose it, revoke and create a new one.')
    }

    return res
  }
}
