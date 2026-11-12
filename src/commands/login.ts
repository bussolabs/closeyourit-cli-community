import {Flags} from '@oclif/core'
import {BaseCommand} from '../base'
import {loadStoredConfig, saveConfig, withActiveLogin} from '../lib/config'
import {isInsecureRemoteUrl} from '../lib/browser'
import {deviceLogin} from '../lib/login'

export default class Login extends BaseCommand {
  static description = 'Authenticate via the device flow and store your CLI token'

  static examples = ['<%= config.bin %> login', '<%= config.bin %> login --api-url https://staging.closeyour.it']

  static flags = {
    'api-url': Flags.string({description: 'Backend base URL to authenticate against (persisted)'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(Login)

    // The flag, else the config — where CLOSEYOURIT_API_URL already overrides the stored address.
    const apiUrl = flags['api-url'] ?? this.cfg.apiUrl
    if (isInsecureRemoteUrl(apiUrl)) {
      // A warning, not a refusal: internal test servers run on plain http. On stderr even in --json
      // mode: stdout stays machine-readable, and an agent still learns about it.
      console.error(`Warning: ${apiUrl} is not HTTPS: the login code and the token will travel unencrypted.`)
    }
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
