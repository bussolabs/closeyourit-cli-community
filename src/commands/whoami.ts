import {BaseCommand} from '../base'

interface WhoAmI {
  account?: {id: string; name: string; email: string}
  organization?: {id: string; name: string; slug: string}
  token?: {id: string; name: string; prefix: string}
  permissions?: string[]
}

export default class Whoami extends BaseCommand {
  static description = 'Show the authenticated account, organization, token prefix and permissions'

  static examples = ['<%= config.bin %> whoami', '<%= config.bin %> whoami --json']

  async run(): Promise<unknown> {
    // Nothing to read from the parser, but oclif validates the command line only here: without this
    // call a mistyped flag is silently ignored and the command answers as if it were right (CYCL-33).
    await this.parse(Whoami)
    const res = await this.api.get<WhoAmI>('/cli/v1/whoami')
    // Rebuild from an allow-list. If a future backend accidentally includes a token secret or other
    // authentication internals, `--json` must not proxy them to stdout.
    const who: WhoAmI = {
      account: res.data.account && {
        id: res.data.account.id,
        name: res.data.account.name,
        email: res.data.account.email,
      },
      organization: res.data.organization && {
        id: res.data.organization.id,
        name: res.data.organization.name,
        slug: res.data.organization.slug,
      },
      token: res.data.token && {
        id: res.data.token.id,
        name: res.data.token.name,
        prefix: res.data.token.prefix,
      },
      permissions: res.data.permissions,
    }

    if (!this.jsonEnabled()) {
      this.log(`Account:     ${who.account?.name ?? '-'} <${who.account?.email ?? '-'}>`)
      this.log(`Organization: ${who.organization?.name ?? '-'} (${who.organization?.slug ?? '-'})`)
      this.log(`Token:       ${who.token?.prefix ?? '-'}`)
      this.log(`Permissions: ${(who.permissions ?? []).join(', ') || '-'}`)
    }

    return who
  }
}
