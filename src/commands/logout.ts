import {BaseCommand} from '../base'
import {clearToken} from '../lib/config'

export default class Logout extends BaseCommand {
  static description = 'Clear the locally stored token and identity'

  static examples = ['<%= config.bin %> logout']

  async run(): Promise<unknown> {
    // Validate the command line before touching the stored credentials: a mistyped flag must stop
    // the command, not be ignored while it logs you out anyway (CYCL-33).
    await this.parse(Logout)
    clearToken()

    if (!this.jsonEnabled()) {
      this.log('Logged out. Local credentials cleared.')
      this.log('To revoke the token on the server, visit /account/cli/tokens.')
    }

    return {ok: true}
  }
}
