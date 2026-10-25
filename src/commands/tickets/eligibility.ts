import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class TicketsEligibility extends BaseCommand {
  // Human override of the agent-eligibility gate (backend gates `tickets.edit`). A ticket reaches the
  // autonomous agents only when it is `allowed`; the automatic verdict is produced by the backend.
  // A human decision is sticky: re-evaluation never overwrites it, `--auto` is how you release it.
  static description = 'Allow or block a ticket for autonomous agents (requires tickets.edit)'

  static examples = [
    '<%= config.bin %> tickets eligibility DRFL-3 --project acme-api --allow',
    '<%= config.bin %> tickets eligibility DRFL-3 --project acme-api --block --reason "touches production data"',
    '<%= config.bin %> tickets eligibility DRFL-3 --project acme-api --auto',
  ]

  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static flags = {
    ...projectFlag,
    allow: Flags.boolean({description: 'Let autonomous agents work this ticket', exclusive: ['block', 'auto']}),
    auto: Flags.boolean({description: 'Drop the human decision and re-evaluate automatically', exclusive: ['allow', 'block']}),
    block: Flags.boolean({description: 'Keep this ticket for a human', exclusive: ['allow', 'auto']}),
    reason: Flags.string({description: 'Why (shown next to the verdict; ignored with --auto)'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsEligibility)
    // One decision per call, and it must be explicit: defaulting would let a typo silently open the
    // gate on a ticket someone meant to keep.
    const decision = [
      flags.allow ? 'allowed' : null,
      flags.block ? 'blocked' : null,
      flags.auto ? 'auto' : null,
    ].find(Boolean)
    if (!decision) this.error('Pick one of --allow, --block or --auto.')

    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/tickets/${args.id}/eligibility`,
      {eligibility: decision, ...(flags.reason ? {reason: flags.reason} : {})},
    )

    if (!this.jsonEnabled()) {
      this.log(`Ticket ${args.id} agent eligibility set to ${decision}:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
