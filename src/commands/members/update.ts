import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class MembersUpdate extends BaseCommand {
  // Update the member's account profile (name/handle). handle is a GLOBAL credential. The server refuses an
  // email change made here (R422-ACCOUNT-001): --email stays accepted but hidden, so the refusal explains it.
  // Only the flags you pass are sent. The backend gates `members.edit` and protects privileged targets
  // (owner/god) from non-privileged actors. The arg is the MEMBERSHIP id (like set-role/set-access).
  static description = "Update a member's profile: name, handle (requires members.edit)"

  static examples = [
    '<%= config.bin %> members update <membership-id> --name "Ada Lovelace"',
    '<%= config.bin %> members update <membership-id> --handle ada',
  ]

  static args = {
    id: Args.string({description: 'Membership id', required: true}),
  }

  static flags = {
    name: Flags.string({description: 'New display name'}),
    email: Flags.string({description: 'The server refuses an email change made here', hidden: true}),
    handle: Flags.string({description: 'New handle (global; a-z, 0-9, underscore)'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MembersUpdate)

    const body: Record<string, unknown> = {}
    if (flags.name !== undefined) body.name = flags.name
    if (flags.email !== undefined) body.email = flags.email
    if (flags.handle !== undefined) body.handle = flags.handle

    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/members/${encodeURIComponent(args.id)}`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Member updated:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
