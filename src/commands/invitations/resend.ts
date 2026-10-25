import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class InvitationsResend extends BaseCommand {
  static args = {
    id: Args.string({description: 'Invitation id (UUID)', required: true}),
  }

  static description = 'Resend a pending invitation. Prints the acceptance link.'

  static examples = ['<%= config.bin %> invitations resend <invitation-uuid>']

  async run(): Promise<unknown> {
    const {args} = await this.parse(InvitationsResend)
    const res = await this.api.put<Record<string, unknown>>(`/cli/v1/invitations/${encodeURIComponent(args.id)}/resend`)
    const invitation = res.data ?? {}

    if (!this.jsonEnabled()) {
      this.log(`Invitation resent to ${invitation.email ?? '-'} (role: ${invitation.role ?? '-'}).`)
      this.log('')
      this.log(`  accept link: ${invitation.accept_url ?? '-'}`)
      this.log('')
      // Same as `invitations create`: only the server knows whether mail is being delivered.
      if (invitation.email_delivery === false) {
        this.warn('Email delivery is off on the server — send this link to the invitee yourself.')
      } else {
        this.log('The invitation email is on its way; send the link yourself if it never lands.')
      }
    }

    return res
  }
}
