import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class TicketsCommentDelete extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id', required: true}),
  }

  static description = 'Delete a comment from a ticket (author, or with tickets.comment.delete_any)'

  static examples = [
    '<%= config.bin %> tickets comment-delete <ticket-id> --project acme-api --comment-id <id> --confirm',
  ]

  static flags = {
    ...projectFlag,
    'comment-id': Flags.string({description: 'Comment id to delete', required: true}),
    confirm: Flags.boolean({description: 'Required: confirm the irreversible deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsCommentDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm (the action is irreversible).', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(
      `/cli/v1/projects/${projectId}/tickets/${args.id}/comments/${flags['comment-id']}`,
    )

    if (!this.jsonEnabled()) this.log(`Deleted comment ${flags['comment-id']}`)

    return {deleted: flags['comment-id']}
  }
}
