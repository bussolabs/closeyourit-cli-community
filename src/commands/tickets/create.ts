import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {ErrorCodes} from '../../errors/error-codes'
import {LENGTH_LIMITS, tooLongMessage} from '../../lib/limits'
import {renderRecord} from '../../lib/output'
import {applyTicketBody, ticketBodyFlags, ticketLengthChecks} from '../../lib/ticket-body'
import {TICKET_PRIORITY, TICKET_STATUS, newTicketLookupFlags} from '../../lib/ticket-lookup'

export default class TicketsCreate extends BaseCommand {
  static description = 'Create a ticket (status defaults to open, priority to medium; both take a code or a label)'

  static examples = [
    '<%= config.bin %> tickets create --project acme-api --title "Checkout fails"',
    '<%= config.bin %> tickets create -p acme-api --title "Login bug" --kind bug --step-given "logged out" --step-when "I submit" --step-then "it 500s"',
    '<%= config.bin %> tickets create -p acme-api --title "Checkout" --scenarios \'[{"title":"Happy","step_given":"logged in","step_when":"I pay","step_then":"order created"}]\' --condition "confirmation email is sent"',
    '<%= config.bin %> tickets create -p acme-api --title "Payment retry" --status in_progress --priority High',
  ]

  static flags = {
    ...projectFlag,
    title: Flags.string({description: `Ticket title (max ${LENGTH_LIMITS.title} characters)`, required: true}),
    kind: Flags.string({description: 'Ticket kind (bug, story, task, epic)', default: 'bug', options: ['bug', 'story', 'task', 'epic']}),
    ...ticketBodyFlags,
    // On a ticket being born, omitting status and priority does not leave them as they were: the defaults apply.
    ...newTicketLookupFlags,
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(TicketsCreate)

    // A new ticket has nothing to safeguard: the cap applies in full, and too-long fields are all
    // reported in this single rejection instead of one per attempt (CYCL-32).
    const tooLong = tooLongMessage(ticketLengthChecks(flags))
    if (tooLong) this.error(tooLong, {exit: 2})

    const projectId = await this.resolveProjectId(flags.project)

    const body: Record<string, unknown> = {title: flags.title, kind: flags.kind}
    applyTicketBody(body, flags)

    // The server demands status and priority ("Status must exist and Priority must exist") while
    // the help gave them as optional: whoever omits them gets the defaults, whoever gives them writes
    // them as they read them (`open`, `In Progress`) instead of hunting for their UUID (CYCL-34).
    const [statusId, priorityId] = await Promise.all([
      this.resolveTicketLookupId(TICKET_STATUS, flags.status),
      this.resolveTicketLookupId(TICKET_PRIORITY, flags.priority),
    ])
    body.status_id = statusId
    body.priority_id = priorityId

    const res = await this.api.post<Record<string, unknown>>(`/cli/v1/projects/${projectId}/tickets`, body)

    // CYCL-52 — from here on the ticket EXISTS on the server, and whatever goes wrong while reporting
    // it does not delete it. If the command exits non-zero without saying anything, the reader
    // concludes it was not created and creates it again: that is how CYRA-755/756 were born, the same
    // ticket twice. So the code and the id are emitted anyway, and only then the real error propagates.
    try {
      if (!this.jsonEnabled()) {
        this.log('Ticket created:')
        this.log(renderRecord(res.data ?? {}))
      }
    } catch (error) {
      const created = res.data ?? {}
      const identity = {code: created.code, id: created.id}
      const reason = error instanceof Error ? error.message : String(error)

      // In data mode there is ONE envelope: letting the error propagate, the base would emit a
      // second one and the reader would find two objects on the same output. Here data and error
      // go together — the ticket is there, and so is what went wrong — and the exit is non-zero.
      if (this.jsonEnabled()) {
        this.logJson({data: identity, error: {code: ErrorCodes.System.unexpected, message: reason}})
        return this.exit(1)
      }

      this.logToStderr(`Ticket creato (${String(identity.code ?? identity.id ?? 'senza codice')}), ma la resa è fallita: ${reason}`)
      throw error
    }

    return res
  }
}
