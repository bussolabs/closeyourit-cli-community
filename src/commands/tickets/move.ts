import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

// CYRA-1352 — the server takes the target by id or key and checks tickets.edit on both projects.
export default class TicketsMove extends BaseCommand {
  static description = 'Move a ticket to another project of the organization: it takes a new code there, the old one keeps pointing to it'

  static examples = [
    '<%= config.bin %> tickets move LBWB-110 --project LBWB --to LBRA',
  ]

  static args = {
    id: Args.string({description: 'Ticket id or code', required: true}),
  }

  static flags = {
    ...projectFlag,
    to: Flags.string({description: 'Target project id (UUID) or key', required: true}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TicketsMove)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/tickets/${args.id}/move`,
      {target_project: flags.to},
    )

    if (!this.jsonEnabled()) {
      this.log(`Ticket ${args.id} moved: it is now ${String(res.data?.code ?? '')}`)
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
