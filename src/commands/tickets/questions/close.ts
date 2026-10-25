import {Args, Flags} from '@oclif/core'

import {BaseCommand, projectFlag} from '../../../base'
import {renderRecord} from '../../../lib/output'

/**
 * Withdraws a question left unanswered (CYCL-60). Same lever as marking it blocking, in reverse:
 * it goes through `tickets.edit`, because it removes what was holding the work. A question that
 * already has an answer cannot be withdrawn — the server refuses it.
 */
export default class TicketsQuestionsClose extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. CYRA-783)', required: true}),
  }

  static description = 'Withdraw a question that is still waiting for an answer (needs tickets.edit)'

  static examples = [
    '<%= config.bin %> tickets questions close CYRA-783 --project closeyourit-rails --question-id <id>',
  ]

  static flags = {
    ...projectFlag,
    'question-id': Flags.string({description: 'Question id to withdraw (from `tickets questions list`)', required: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsQuestionsClose)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/questions/${encodeURIComponent(flags['question-id'])}/closure`,
      {},
    )

    if (!this.jsonEnabled()) {
      this.log('Question withdrawn:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
