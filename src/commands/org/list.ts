import {BaseCommand} from '../../base'
import {loadStoredConfig, savedLogins} from '../../lib/config'
import {renderTable} from '../../lib/output'

export default class OrgList extends BaseCommand {
  static description = 'List the organizations this computer is signed into (the ones `org switch` reaches without a browser)'

  static examples = ['<%= config.bin %> org list', '<%= config.bin %> org list --json']

  async run(): Promise<unknown> {
    await this.parse(OrgList)
    const stored = loadStoredConfig()
    // Built field by field: the saved tokens never leave the config file, not even with --json.
    const organizations = savedLogins(stored).map((login) => ({
      id: login.organization.id,
      name: login.organization.name,
      slug: login.organization.slug,
      account: login.account?.email,
      active: login.token === stored.token,
    }))

    if (!this.jsonEnabled()) {
      if (organizations.length === 0) {
        this.log('No organization saved yet: run `login` to sign in.')
      } else {
        this.log(
          renderTable(
            ['', 'NAME', 'SLUG', 'ACCOUNT'],
            organizations.map((org) => [org.active ? '*' : '', org.name, org.slug, org.account ?? '']),
          ),
        )
      }
    }

    return organizations
  }
}
