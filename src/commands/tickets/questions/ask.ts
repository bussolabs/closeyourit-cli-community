import {Args, Flags} from '@oclif/core'

import {BaseCommand, projectFlag} from '../../../base'
import {LENGTH_LIMITS, tooLongMessage} from '../../../lib/limits'
import {renderRecord} from '../../../lib/output'

/**
 * Asks a question on a ticket (CYCL-60).
 *
 * The channel is for PEOPLE, and it is not a CLI restriction: an agent in the read phase cannot
 * use it anyway, because the sandbox guardrails reject every command containing `?` — and a
 * question by definition ends with a question mark. Agents keep the phase result (see
 * config/routes/cli.rb in closeyourit-rails).
 */
export default class TicketsQuestionsAsk extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. CYRA-783)', required: true}),
  }

  static description = 'Ask a question about a ticket'

  static examples = [
    '<%= config.bin %> tickets questions ask CYRA-783 --project closeyourit-rails --body "Il tetto vale anche per le risposte?"',
    '<%= config.bin %> tickets questions ask CYRA-783 -p closeyourit-rails --body "Chi decide?" --blocking',
  ]

  static flags = {
    ...projectFlag,
    body: Flags.string({
      description: `The question, in plain words (max ${LENGTH_LIMITS.question} characters — it must read as a question, not as a command or a URL)`,
      required: true,
    }),
    // Marking a question as blocking stops the agents' queue: it is a lever on the work and goes
    // through `tickets.edit`. Without that permission the server records the question anyway, it just
    // does not block — so the flag is not refused here, it is sent and the server decides.
    blocking: Flags.boolean({
      description: 'Mark the question as blocking: the agent queue stops on this ticket until it is answered (needs tickets.edit)',
      default: false,
    }),
    shared: Flags.boolean({
      description: 'Make the question visible to the client too (default: internal only)',
      default: false,
    }),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsQuestionsAsk)

    // The cap is the comment one and the server measures it anyway: saying it first avoids sending
    // a text already rejected (same rule as CYCL-32).
    const tooLong = tooLongMessage([
      {flag: '--body', value: flags.body, max: LENGTH_LIMITS.question, orthography: true},
    ])
    if (tooLong) this.error(tooLong, {exit: 2})

    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/questions`,
      {audience: flags.shared ? 'shared' : 'internal', blocking: flags.blocking, body: flags.body},
    )

    if (!this.jsonEnabled()) {
      this.log('Question asked:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
