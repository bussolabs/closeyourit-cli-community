import {BaseCommand, pageFlag} from '../../base'
import {renderTable} from '../../lib/output'

export default class InvitationsList extends BaseCommand {
  static description = 'List the pending/accepted invitations of your organization'

  static examples = ['<%= config.bin %> invitations list', '<%= config.bin %> invitations list --json']

  static flags = {...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(InvitationsList)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/invitations?page=${flags.page}`)
    const invitations = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['EMAIL', 'ROLE', 'ACCEPTED', 'ID'],
          invitations.map((invitation) => [
            String(invitation.email ?? ''),
            String(invitation.role ?? ''),
            invitation.accepted_at ? 'yes' : 'no',
            String(invitation.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
