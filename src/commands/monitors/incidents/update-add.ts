import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import {renderRecord} from '../../../lib/output'

export default class MonitorsIncidentsUpdateAdd extends BaseCommand {
  static description = 'Add a timeline step to a narrated incident'

  static examples = [
    '<%= config.bin %> monitors incidents update-add <monitor-id> <incident-id> --project acme-api --phase monitoring --body "Recovering"',
  ]

  static args = {
    monitor: Args.string({description: 'Monitor id', required: true}),
    incident: Args.string({description: 'Incident id (primary)', required: true}),
  }

  static flags = {
    ...projectFlag,
    phase: Flags.string({
      description: 'Timeline phase of the step',
      options: ['detected', 'investigating', 'fixing', 'monitoring', 'resolved'],
      required: true,
    }),
    body: Flags.string({description: 'Text of the step'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MonitorsIncidentsUpdateAdd)
    const projectId = await this.resolveProjectId(flags.project)

    const body: Record<string, unknown> = {phase: flags.phase}
    if (flags.body !== undefined) body.body = flags.body

    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/monitors/${encodeURIComponent(args.monitor)}/incidents/${encodeURIComponent(args.incident)}/updates`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Incident update added:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
