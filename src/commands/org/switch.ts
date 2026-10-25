import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {type LoginIdentity, loadStoredConfig, saveConfig, savedLogins, withActiveLogin} from '../../lib/config'
import {deviceLogin} from '../../lib/login'

export default class OrgSwitch extends BaseCommand {
  static description =
    'Switch the active organization. The first time for an organization it signs in through the browser, then it is instant'

  static examples = ['<%= config.bin %> org switch acme', '<%= config.bin %> org switch acme --json']

  static args = {
    slug: Args.string({description: 'Organization slug (see `org list`)', required: true}),
  }

  async run(): Promise<unknown> {
    const {args} = await this.parse(OrgSwitch)
    const wanted = args.slug.trim().toLowerCase()
    // Switching rewrites the config on disk, so it works on the stored endpoint, never an env override.
    const stored = loadStoredConfig()
    let identity: LoginIdentity | undefined = savedLogins(stored).find((login) => login.organization.slug.toLowerCase() === wanted)

    if (!identity) {
      if (!this.jsonEnabled()) this.log(`Not signed into "${args.slug}" yet: pick it in the browser.`)
      identity = (
        await deviceLogin(stored.apiUrl, {
          clientName: `closeyourit-cli/${this.config.version} (${process.platform} ${process.arch})`,
          quiet: this.jsonEnabled(),
          log: (line) => this.log(line),
        })
      ).identity
    }

    saveConfig(withActiveLogin(stored, identity))

    const organization = identity.organization
    // The browser lets the user pick any organization: say so when it is not the one asked for.
    if (organization && organization.slug.toLowerCase() !== wanted) {
      this.warn(`You picked ${organization.name} (${organization.slug}) in the browser, not "${args.slug}".`)
    }
    if (process.env.CLOSEYOURIT_TOKEN?.trim()) {
      this.warn('CLOSEYOURIT_TOKEN is set: commands keep using that token until you unset it.')
    }

    if (!this.jsonEnabled()) {
      this.log(`Now in ${organization ? `${organization.name} (${organization.slug})` : 'no organization'}`)
    }

    return {organization, account: identity.account}
  }
}
