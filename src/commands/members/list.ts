import {BaseCommand, pageFlag} from '../../base'
import {renderTable} from '../../lib/output'

export default class MembersList extends BaseCommand {
  static description = 'List the members of your organization (to resolve emails to account ids)'

  static examples = ['<%= config.bin %> members list', '<%= config.bin %> members list --json']

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(MembersList)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/members?page=${flags.page}`)
    const members = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['EMAIL', 'NAME', 'ROLE', 'ACCOUNT_ID'],
          members.map((member) => [
            String(member.email ?? ''),
            String(member.name ?? ''),
            String(member.membership_role ?? ''),
            String(member.account_id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
