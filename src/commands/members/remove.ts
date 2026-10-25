import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class MembersRemove extends BaseCommand {
  // Remove the membership from the organization (the account survives, it just loses access to this org).
  // The backend gates `members.manage`. Irreversible → requires --confirm. The arg is the MEMBERSHIP id.
  static description = 'Remove a member from your organization (irreversible; requires members.manage)'

  static examples = ['<%= config.bin %> members remove <membership-id> --confirm']

  static args = {
    id: Args.string({description: 'Membership id', required: true}),
  }

  static flags = {
    confirm: Flags.boolean({description: 'Required: confirm the irreversible removal'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MembersRemove)

    if (!flags.confirm) {
      this.error('Refusing to remove without --confirm (the action is irreversible).', {exit: 2})
    }

    await this.api.delete(`/cli/v1/members/${encodeURIComponent(args.id)}`)

    if (!this.jsonEnabled()) this.log(`Removed member ${args.id}`)

    return {removed: args.id}
  }
}
