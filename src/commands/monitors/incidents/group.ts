import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import {renderRecord} from '../../../lib/output'

export default class MonitorsIncidentsGroup extends BaseCommand {
  static description = 'Unify incidents of a monitor and post the first narration step'

  static examples = [
    '<%= config.bin %> monitors incidents group <monitor-id> --project acme-api --incident <id-a> --incident <id-b> --phase investigating --body "Looking into it"',
  ]

  static args = {
    monitor: Args.string({description: 'Monitor id', required: true}),
  }

  static flags = {
    ...projectFlag,
    incident: Flags.string({description: 'Incident id to unify (repeatable)', multiple: true, required: true}),
    phase: Flags.string({
      description: 'Timeline phase of the first step',
      options: ['detected', 'investigating', 'fixing', 'monitoring', 'resolved'],
      required: true,
    }),
    body: Flags.string({description: 'Text of the first narration step'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MonitorsIncidentsGroup)
    const projectId = await this.resolveProjectId(flags.project)

    const body: Record<string, unknown> = {incident_ids: flags.incident, phase: flags.phase}
    if (flags.body !== undefined) body.body = flags.body

    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/monitors/${encodeURIComponent(args.monitor)}/incidents/group`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Incidents grouped:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
