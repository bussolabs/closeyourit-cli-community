import {Args, Flags} from '@oclif/core'
import {ApiRequestError} from '../../lib/api'
import {BaseCommand, projectFlag} from '../../base'
import {ErrorCodes} from '../../errors/error-codes'
import {renderRecord} from '../../lib/output'

export default class ErrorsAssign extends BaseCommand {
  // PATCH .../assign both assigns and unassigns: an empty `assignee_id` clears the current one.
  // The route is declared `patch` on the server, so PUT is not an option here.
  static description = 'Put an error group in someone\'s hands, or take it out (--unassign)'

  static examples = [
    '<%= config.bin %> errors assign <group-id> --project acme-api --assignee alice@acme.test',
    '<%= config.bin %> errors assign <group-id> --project acme-api --unassign',
  ]

  static args = {
    id: Args.string({description: 'Error group id', required: true}),
  }

  static flags = {
    ...projectFlag,
    assignee: Flags.string({description: 'Account id (UUID) or member email', exclusive: ['unassign']}),
    unassign: Flags.boolean({description: 'Leave the group to nobody', exclusive: ['assignee']}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(ErrorsAssign)
    if (!flags.unassign && flags.assignee === undefined) {
      this.error('Provide --assignee <id|email> or --unassign.', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    const assigneeId = flags.unassign ? '' : await this.resolveMemberId(flags.assignee as string)

    const res = await this.api.patch<{assignee?: {id?: string; name?: string} | null}>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/error_groups/${encodeURIComponent(args.id)}/assign`,
      {assignee_id: assigneeId},
    )
    const assignee = res.data?.assignee ?? undefined

    if (!this.jsonEnabled()) {
      this.log(
        flags.unassign
          ? `Error group ${args.id} unassigned.`
          : `Error group ${args.id} assigned to ${assignee?.name ?? assigneeId}.`,
      )
      this.log(renderRecord({...(res.data ?? {}), assignee: assignee?.name ?? null}))
    }

    // An account outside the organization is not found by the server, which leaves the group
    // unassigned and answers 200 all the same (`Errors::Assign`, anti-BOLA). Read as success, the
    // command would report an error handed to someone who never received it.
    //
    // Compared case-insensitively: a UUID typed in uppercase passes `UUID_RE` and travels as
    // written, while the database gives it back lowercase. A literal comparison would call a
    // perfectly good assignment a refusal.
    if (!flags.unassign && (assignee?.id ?? '').toLowerCase() !== assigneeId.toLowerCase()) {
      throw new ApiRequestError(
        404,
        ErrorCodes.Member.notFound,
        `The server did not assign ${flags.assignee}: that account (${assigneeId}) is not a member of this organization. The error group is left unassigned.`,
      )
    }

    return res
  }
}
