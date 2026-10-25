import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class IdeasCommentDelete extends BaseCommand {
  static args = {
    id: Args.string({description: 'Idea id', required: true}),
  }

  static description = 'Delete a comment from an open idea (author, or with ideas.comment.delete_any)'

  static examples = [
    '<%= config.bin %> ideas comment-delete <idea-id> --project acme-api --comment-id <id> --confirm',
  ]

  static flags = {
    ...projectFlag,
    'comment-id': Flags.string({description: 'Comment id to delete', required: true}),
    confirm: Flags.boolean({description: 'Required: confirm the irreversible deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(IdeasCommentDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm (the action is irreversible).', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(
      `/cli/v1/projects/${projectId}/ideas/${args.id}/comments/${flags['comment-id']}`,
    )

    if (!this.jsonEnabled()) this.log(`Deleted comment ${flags['comment-id']}`)

    return {deleted: flags['comment-id']}
  }
}
