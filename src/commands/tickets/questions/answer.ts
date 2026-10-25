import {Args, Flags} from '@oclif/core'

import {BaseCommand, projectFlag} from '../../../base'
import {LENGTH_LIMITS, tooLongMessage} from '../../../lib/limits'
import {renderRecord} from '../../../lib/output'

/**
 * Answers ONE question (CYCL-60). The answer belongs to the given question: it is not "the next
 * message", which was the flaw of comments — a comment written in the meantime can no longer close
 * a question by mistake.
 */
export default class TicketsQuestionsAnswer extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. CYRA-783)', required: true}),
  }

  static description = 'Answer one question of a ticket'

  static examples = [
    '<%= config.bin %> tickets questions answer CYRA-783 --project closeyourit-rails --question-id <id> --body "Sì, lo stesso tetto."',
    '<%= config.bin %> tickets questions answer CYRA-783 --project closeyourit-rails --question-id <id> --choice 2',
  ]

  static flags = {
    ...projectFlag,
    'question-id': Flags.string({description: 'Question id to answer (from `tickets questions list`)', required: true}),
    body: Flags.string({
      description: `The answer (max ${LENGTH_LIMITS.answer} characters)`,
      exactlyOne: ['body', 'choice'],
    }),
    // CYRA-1033 — the number of a proposed answer, as `tickets questions list` shows it.
    choice: Flags.integer({
      description: 'Number of a proposed answer (from `tickets questions list`)',
      min: 1,
      exactlyOne: ['body', 'choice'],
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsQuestionsAnswer)

    if (flags.body !== undefined) {
      const tooLong = tooLongMessage([
        {flag: '--body', value: flags.body, max: LENGTH_LIMITS.answer, orthography: true},
      ])
      if (tooLong) this.error(tooLong, {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/questions/${encodeURIComponent(flags['question-id'])}/answers`,
      flags.choice === undefined ? {body: flags.body} : {choice: flags.choice},
    )

    if (!this.jsonEnabled()) {
      this.log('Answer sent:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
