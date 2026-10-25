import {Args, Flags} from '@oclif/core'

import {BaseCommand, projectFlag} from '../../../base'

/**
 * Deletes a question (CYCL-60). Different from withdrawing: withdrawing leaves it in the ticket's
 * history marked as withdrawn, this removes it entirely, answers included. Author, or
 * `tickets.comment.delete_any`.
 */
export default class TicketsQuestionsDelete extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. CYRA-783)', required: true}),
  }

  static description =
    'Delete a question from a ticket, answers included (author, or with tickets.comment.delete_any) — to keep it in the history, withdraw it instead'

  static examples = [
    '<%= config.bin %> tickets questions delete CYRA-783 --project closeyourit-rails --question-id <id> --confirm',
  ]

  static flags = {
    ...projectFlag,
    'question-id': Flags.string({description: 'Question id to delete', required: true}),
    confirm: Flags.boolean({description: 'Required: confirm the irreversible deletion'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsQuestionsDelete)

    if (!flags.confirm) {
      this.error('Refusing to delete without --confirm (the action is irreversible). To keep the question in the history, withdraw it with `tickets questions close`.', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/questions/${encodeURIComponent(flags['question-id'])}`,
    )

    if (!this.jsonEnabled()) this.log(`Deleted question ${flags['question-id']}`)

    return {deleted: flags['question-id']}
  }
}
