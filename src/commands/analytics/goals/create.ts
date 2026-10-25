import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import {renderRecord} from '../../../lib/output'

export default class AnalyticsGoalsCreate extends BaseCommand {
  static description = 'Create a conversion goal on a project'

  static examples = [
    '<%= config.bin %> analytics goals create -p acme-web --kind custom_event --display-name Signup --event-name signup',
    '<%= config.bin %> analytics goals create -p acme-web --kind pageview_path --display-name Pricing --path-pattern "/pricing"',
  ]

  static flags = {
    ...projectFlag,
    kind: Flags.string({description: 'Goal kind', options: ['pageview_path', 'custom_event'], required: true}),
    'display-name': Flags.string({description: 'Human-readable goal name', required: true}),
    'event-name': Flags.string({description: 'Custom event name (required for custom_event goals)'}),
    'path-pattern': Flags.string({description: 'Path pattern, "*" suffix = prefix match (required for pageview_path goals)'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(AnalyticsGoalsCreate)
    const projectId = await this.resolveProjectId(flags.project)

    const body: Record<string, unknown> = {kind: flags.kind, display_name: flags['display-name']}
    if (flags['event-name'] !== undefined) body.event_name = flags['event-name']
    if (flags['path-pattern'] !== undefined) body.path_pattern = flags['path-pattern']

    const res = await this.api.post<Record<string, unknown>>(`/cli/v1/projects/${projectId}/analytics/goals`, body)

    if (!this.jsonEnabled()) {
      this.log('Goal created:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
