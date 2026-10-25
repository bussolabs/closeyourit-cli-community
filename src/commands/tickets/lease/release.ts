import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import type {Envelope} from '../../../lib/api'
import {describeLeaseConflict, leaseErrorEnvelope} from '../../../lib/lease'
import {renderRecord} from '../../../lib/output'

export default class TicketsLeaseRelease extends BaseCommand {
  static description = 'Release your own working lease on a ticket, so someone else can claim it'

  static examples = [
    '<%= config.bin %> tickets lease release <ticket-id> --project acme-api',
    '<%= config.bin %> tickets lease release DRFL-3 -p driverone-flutter --run-id run-42',
  ]

  static args = {
    id: Args.string({description: 'Ticket id or code (e.g. DRFL-3)', required: true}),
  }

  static flags = {
    ...projectFlag,
    'run-id': Flags.string({description: 'Automation run id, for tokens that juggle several concurrent runs'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsLeaseRelease)
    const projectId = await this.resolveProjectId(flags.project)
    const path = `/cli/v1/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(args.id)}/lease`

    const body: Record<string, unknown> = {}
    if (flags['run-id'] !== undefined) body.run_id = flags['run-id']

    let res: Envelope<Record<string, unknown>>
    try {
      res = await this.api.delete<Record<string, unknown>>(path, {body})
    } catch (error) {
      // 409 = somebody else already holds it, 404 = no lease to release. --json prints the full
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
      this.log(`Ticket ${args.id} lease released:`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
