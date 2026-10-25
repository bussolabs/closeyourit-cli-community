import {BaseCommand, projectFlag} from '../../../base'
import {renderTable} from '../../../lib/output'

export default class AnalyticsGoalsList extends BaseCommand {
  static description = 'List the conversion goals of a project'

  static examples = ['<%= config.bin %> analytics goals list --project acme-web']

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(AnalyticsGoalsList)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Array<Record<string, unknown>>>(`/cli/v1/projects/${projectId}/analytics/goals`)
    const goals = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['NAME', 'KIND', 'TARGET', 'ID'],
          goals.map((goal) => [
            String(goal.display_name ?? ''),
            String(goal.kind ?? ''),
            String(goal.event_name ?? goal.path_pattern ?? ''),
            String(goal.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
