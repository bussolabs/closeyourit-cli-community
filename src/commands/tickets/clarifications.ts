import {Args} from '@oclif/core'

import {BaseCommand, projectFlag} from '../../base'
import {renderClarificationState} from '../../lib/ticket-clarifications'

/**
 * A ticket's clarification-cycle state, asked from the system (CYRA-628).
 *
 * It is the channel that replaces re-parsing the discussion: the triage skill and the automator
 * read an HTML marker in the comment text and tried to guess whether a question was pending and at
 * which round. A line written by the system itself was enough to restart it.
 *
 * Read-only: the questions are written by the server when triage delivers them, not by an external caller.
 */
export default class TicketsClarifications extends BaseCommand {
  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static description = 'Show the clarification cycle state of a ticket (rounds, reply, escalation)'

  static examples = [
    '<%= config.bin %> tickets clarifications <ticket-id> --project acme-api',
    '<%= config.bin %> tickets clarifications DRFL-3 -p acme-api --json',
  ]

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsClarifications)
    const projectId = await this.resolveProjectId(flags.project)
    const path = `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/clarifications`

    const res = await this.api.get<Record<string, unknown>>(path)

    if (!this.jsonEnabled()) {
      this.log(renderClarificationState(res.data ?? {}))
    }

    return res
  }
}
