import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {LENGTH_LIMITS, tooLongMessage} from '../../lib/limits'
import {renderRecord} from '../../lib/output'
import {TICKET_PRIORITY, TICKET_STATUS, newTicketLookupFlags} from '../../lib/ticket-lookup'
import {WORKLOAD_ACTIONS_PATH} from '../../lib/workload'

export default class WorkloadPromote extends BaseCommand {
  static args = {
    action: Args.string({description: 'Workload action id', required: true}),
  }

  static description =
    'Generate a ticket from a workload action and link it back (the action keeps existing; an already linked action is refused)'

  static examples = [
    '<%= config.bin %> workload promote <action-id> --project acme-api',
    '<%= config.bin %> workload promote <action-id> -p acme-api --title "Implement the partner API" --description "Agreed in the meeting" --kind story --priority High',
  ]

  static flags = {
    ...projectFlag,
    title: Flags.string({
      description: `Ticket title (default: the action title, max ${LENGTH_LIMITS.title} characters)`,
    }),
    description: Flags.string({description: `Ticket description (max ${LENGTH_LIMITS.description} characters)`}),
    kind: Flags.string({description: 'Ticket kind (default: task)', options: ['bug', 'story', 'task', 'epic']}),
    ...newTicketLookupFlags,
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(WorkloadPromote)

    // The ticket is born here: the caps of `tickets create` apply, and they are all reported in a
    // single rejection, before any call (CYCL-32).
    const tooLong = tooLongMessage([
      {flag: '--title', value: flags.title, max: LENGTH_LIMITS.title, orthography: true},
      {flag: '--description', value: flags.description, max: LENGTH_LIMITS.description, orthography: true},
    ])
    if (tooLong) this.error(tooLong, {exit: 2})

    const projectId = await this.resolveProjectId(flags.project)

    const body: Record<string, unknown> = {project_id: projectId}
    if (flags.title !== undefined) body.title = flags.title
    if (flags.description !== undefined) body.description = flags.description
    if (flags.kind !== undefined) body.kind = flags.kind
    if (flags.status !== undefined) body.status_id = await this.resolveTicketLookupId(TICKET_STATUS, flags.status)
    if (flags.priority !== undefined) {
      body.priority_id = await this.resolveTicketLookupId(TICKET_PRIORITY, flags.priority)
    }

    const res = await this.api.post<Record<string, unknown>>(
      `${WORKLOAD_ACTIONS_PATH}/${encodeURIComponent(args.action)}/promotion`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Ticket created from the workload action:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
