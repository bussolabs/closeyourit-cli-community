import {Args} from '@oclif/core'
import {BaseCommand} from '../../../base'

export default class ServersTokensCreate extends BaseCommand {
  static args = {
    name: Args.string({description: 'Token name (e.g. fleet)', required: true}),
  }

  static description = 'Create a fleet enrollment token (the secret is shown only once)'

  static examples = ['<%= config.bin %> servers tokens create fleet']

  async run(): Promise<unknown> {
    const {args} = await this.parse(ServersTokensCreate)
    const res = await this.api.post<Record<string, unknown>>('/cli/v1/server_tokens', {name: args.name})
    const token = res.data ?? {}

    if (!this.jsonEnabled()) {
      this.log('Enrollment token created. Store the secret now — it is shown only once:')
      this.log('')
      this.log(`  secret: ${token.secret ?? '-'}`)
      this.log('')
      this.warn('The secret cannot be retrieved again. If you lose it, revoke and create a new one.')
    }

    return res
  }
}
