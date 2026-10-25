import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import type {Envelope} from '../../../lib/api'
import {describeLeaseConflict, leaseErrorEnvelope} from '../../../lib/lease'
import {renderRecord} from '../../../lib/output'

export default class TicketsLeaseRenew extends BaseCommand {
  static description = 'Extend your own working lease on a ticket before it expires'

  static examples = [
    '<%= config.bin %> tickets lease renew <ticket-id> --project acme-api',
    '<%= config.bin %> tickets lease renew DRFL-3 -p driverone-flutter --ttl 3600 --run-id run-42',
  ]

  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static flags = {
    ...projectFlag,
    ttl: Flags.integer({description: 'New lease duration in seconds (server default: 8h; range 1s..30 days)'}),
    'run-id': Flags.string({description: 'Automation run id, for tokens that juggle several concurrent runs'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsLeaseRenew)
    const projectId = await this.resolveProjectId(flags.project)
    const path = `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/lease`

    const body: Record<string, unknown> = {}
    if (flags.ttl !== undefined) body.ttl_seconds = flags.ttl
    if (flags['run-id'] !== undefined) body.run_id = flags['run-id']

    let res: Envelope<Record<string, unknown>>
    try {
      res = await this.api.put<Record<string, unknown>>(path, body)
    } catch (error) {
      // 409 = somebody else already holds it, 404 = no lease to renew. --json prints the full
      // backend envelope (details included) itself and returns, so BaseCommand.catch never trims
      // it down to {code,message}; human mode gets the holder spelled out instead (CYCL-14).
      if (this.jsonEnabled()) {
        const envelope = leaseErrorEnvelope(error)
        if (!envelope) throw error
        this.logJson(envelope)
        process.exitCode = 1
        return
      }

      throw describeLeaseConflict(error)
    }

    if (!this.jsonEnabled()) {
      const lease = res.data ?? {}
      this.log(`Ticket ${args.id} lease renewed until ${lease.expires_at ?? '?'}:`)
      this.log(renderRecord(leaseSummary(lease)))
    }

    return res
  }
}

/** Flatten the lease payload for `renderRecord`: `held_by` is a nested object, so print it as one line. */
function leaseSummary(lease: Record<string, unknown>): Record<string, unknown> {
  const heldBy = lease.held_by as {kind?: string; id?: string; name?: string} | undefined
  return {
    ticket: lease.ticket,
    run_id: lease.run_id,
    held_by: heldBy ? `${heldBy.kind} ${heldBy.name ?? heldBy.id}` : null,
    expires_at: lease.expires_at,
    host_id: lease.host_id,
    account_id: lease.account_id,
    agent: lease.agent,
    execution_phase: lease.execution_phase,
    profile_digest: lease.profile_digest,
  }
}
