import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class InvitationsRevoke extends BaseCommand {
  static args = {
    id: Args.string({description: 'Invitation id (UUID)', required: true}),
  }

  static description = 'Revoke a pending invitation'

  static examples = ['<%= config.bin %> invitations revoke <invitation-uuid>']

  async run(): Promise<unknown> {
    const {args} = await this.parse(InvitationsRevoke)
    await this.api.delete(`/cli/v1/invitations/${args.id}`)

    if (!this.jsonEnabled()) {
      this.log(`Invitation revoked: ${args.id}`)
    }

    return {revoked: args.id}
  }
}
