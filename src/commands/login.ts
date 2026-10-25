import {Flags} from '@oclif/core'
import {BaseCommand} from '../base'
import {loadStoredConfig, saveConfig, withActiveLogin} from '../lib/config'
import {deviceLogin} from '../lib/login'

export default class Login extends BaseCommand {
  static description = 'Authenticate via the device flow and store your CLI token'

  static examples = ['<%= config.bin %> login', '<%= config.bin %> login --api-url https://staging.closeyour.it']

  static flags = {
    'api-url': Flags.string({description: 'Backend base URL to authenticate against (persisted)'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(Login)

    const apiUrl = flags['api-url'] ?? this.cfg.apiUrl
    const {identity, token} = await deviceLogin(apiUrl, {
      clientName: `closeyourit-cli/${this.config.version} (${process.platform} ${process.arch})`,
      quiet: this.jsonEnabled(),
      log: (line) => this.log(line),
    })

    // The other organizations stay saved, so `org switch` can go back to them without a browser.
    saveConfig(withActiveLogin(loadStoredConfig(), identity))

    if (!this.jsonEnabled()) {
      this.log('')
      this.log(`Logged in as ${identity.account?.email ?? 'unknown'} · ${identity.organization?.name ?? 'no organization'}`)
    }

    return {account: identity.account, organization: identity.organization, token}
  }
}
