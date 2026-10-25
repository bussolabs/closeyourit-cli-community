import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {LENGTH_LIMITS, tooLongMessage} from '../../lib/limits'
import {renderRecord} from '../../lib/output'
import {TICKET_PRIORITY, TICKET_STATUS, newTicketLookupFlags} from '../../lib/ticket-lookup'

export default class IdeasConvert extends BaseCommand {
  static args = {
    id: Args.string({description: 'Idea id', required: true}),
  }

  static description =
    'Convert an idea into a ticket. Without --title/--description the server AI synthesizes the draft from the idea and its comments (may take ~30s). Author always allowed; others need ideas.convert.'

  static examples = [
    '<%= config.bin %> ideas convert <idea-id> --project acme-api',
    '<%= config.bin %> ideas convert <idea-id> -p acme-api --title "Dark mode" --description "Full spec…" --kind feature',
  ]

  static flags = {
    ...projectFlag,
    // The ticket is born here, so the caps of `tickets create` apply (CYCL-32).
    title: Flags.string({
      description: `Ticket title (skips AI when set together with --description, max ${LENGTH_LIMITS.title} characters)`,
    }),
    description: Flags.string({
      description: `Ticket description (skips AI when set together with --title, max ${LENGTH_LIMITS.description} characters)`,
    }),
    kind: Flags.string({description: 'Ticket kind (default: story)', options: ['bug', 'story', 'task', 'epic']}),
    // The ticket is born here: status and priority are given by code or label, and omitting them
    // applies the default the server uses on conversion (CYCL-34).
    ...newTicketLookupFlags,
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(IdeasConvert)

    // The ticket is new: nothing to safeguard, full cap, and too-long fields are all reported in
    // this single rejection — before the ~30 seconds of AI synthesis, not after.
    const tooLong = tooLongMessage([
      {flag: '--title', value: flags.title, max: LENGTH_LIMITS.title, orthography: true},
      {flag: '--description', value: flags.description, max: LENGTH_LIMITS.description, orthography: true},
    ])
    if (tooLong) this.error(tooLong, {exit: 2})

    const projectId = await this.resolveProjectId(flags.project)

    const body: Record<string, unknown> = {}
    if (flags.title !== undefined) body.title = flags.title
    if (flags.description !== undefined) body.description = flags.description
    if (flags.kind !== undefined) body.kind = flags.kind
    if (flags.status !== undefined) body.status_id = await this.resolveTicketLookupId(TICKET_STATUS, flags.status)
    if (flags.priority !== undefined) {
      body.priority_id = await this.resolveTicketLookupId(TICKET_PRIORITY, flags.priority)
    }

    if (!this.jsonEnabled() && (flags.title === undefined || flags.description === undefined)) {
      this.log('Synthesizing the ticket draft with AI (idea + comments), this may take ~30s…')
    }

    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/ideas/${args.id}/conversion`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Idea converted — ticket created:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
