import {BaseCommand, pageFlag, projectFlag} from '../../base'
import {renderTable} from '../../lib/output'

export default class MilestonesList extends BaseCommand {
  static description = 'List the milestones for a project'

  static examples = [
    '<%= config.bin %> milestones list --project acme-api',
    '<%= config.bin %> milestones list -p acme-api --json',
  ]

  static flags = {...projectFlag, ...pageFlag}

  async run(): Promise<unknown> {
    const {flags} = await this.parse(MilestonesList)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Array<Record<string, unknown>>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/milestones?page=${flags.page}`,
    )
    const milestones = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['CODE', 'LABEL', 'DUE_ON', 'ACTIVE', 'ID'],
          milestones.map((milestone) => [
            String(milestone.code ?? ''),
            String(milestone.label ?? ''),
            String(milestone.due_on ?? ''),
            String(milestone.active ?? ''),
            String(milestone.id ?? ''),
          ]),
        ),
      )
    }

    return res
  }
}
