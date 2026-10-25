import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class MembersSetRole extends BaseCommand {
  static args = {
    id: Args.string({description: 'Membership id', required: true}),
  }

  static description = "Change a member's organization role"

  static examples = [
    '<%= config.bin %> members set-role <membership-id> --role admin',
    '<%= config.bin %> members set-role <membership-id> --role customer',
  ]

  static flags = {
    role: Flags.string({
      description: 'Organization role',
      options: ['member', 'admin', 'owner', 'customer'],
      required: true,
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MembersSetRole)
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/members/${encodeURIComponent(args.id)}/role`,
      {role: flags.role},
    )

    if (!this.jsonEnabled()) {
      this.log('Member role updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
