import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class InvitationsCreate extends BaseCommand {
  static args = {
    email: Args.string({description: 'Email address to invite', required: true}),
  }

  static description = 'Invite a person to the organization. Prints the acceptance link.'

  static examples = [
    '<%= config.bin %> invitations create client@acme.com',
    '<%= config.bin %> invitations create teammate@acme.com --role member',
  ]

  static flags = {
    role: Flags.string({
      default: 'customer',
      description: 'Membership role',
      options: ['customer', 'member', 'admin'],
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(InvitationsCreate)
    const res = await this.api.post<Record<string, unknown>>('/cli/v1/invitations', {
      email: args.email,
      role: flags.role,
    })
    const invitation = res.data ?? {}

    if (!this.jsonEnabled()) {
      this.log(`Invitation created for ${invitation.email ?? args.email} (role: ${invitation.role ?? flags.role}).`)
      this.log('')
      this.log(`  accept link: ${invitation.accept_url ?? '-'}`)
      this.log('')
      // The server reports whether mail actually goes out (email_delivery). This used to be a fixed
      // sentence printed every time, which said nothing about the real state of delivery.
      if (invitation.email_delivery === false) {
        this.warn('Email delivery is off on the server — send this link to the invitee yourself.')
      } else {
        this.log('The invitation email is on its way; send the link yourself if it never lands.')
      }
    }

    return res
  }
}
