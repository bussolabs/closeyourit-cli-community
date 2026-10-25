import {Flags} from '@oclif/core'
import {BaseCommand, pageFlag, projectFlag} from '../../base'
import {renderTable, statusCell} from '../../lib/output'

export default class IdeasList extends BaseCommand {
  static description = 'List ideas for a project (sorted by votes)'

  static examples = [
    '<%= config.bin %> ideas list --project acme-api',
    '<%= config.bin %> ideas list -p acme-api --status open --sort recent --json',
  ]

  static flags = {
    ...projectFlag,
    ...pageFlag,
    status: Flags.string({description: 'Filter by status (open|converted|archived)'}),
    sort: Flags.string({description: 'Sort order (votes|recent, default votes)'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(IdeasList)
    const projectId = await this.resolveProjectId(flags.project)
    const params = new URLSearchParams({page: String(flags.page)})
    if (flags.status) params.set('status', flags.status)
    if (flags.sort) params.set('sort', flags.sort)

    const res = await this.api.get<Array<Record<string, unknown>>>(
      `/cli/v1/projects/${projectId}/ideas?${params.toString()}`,
    )
    const ideas = res.data ?? []

    if (!this.jsonEnabled()) {
      this.log(
        renderTable(
          ['ID', 'TITLE', 'STATUS', 'VOTES', 'COMMENTS'],
          ideas.map((idea) => [
            String(idea.id ?? ''),
            String(idea.title ?? ''),
            statusCell(idea.status),
            String(idea.votes_count ?? 0),
            String(idea.comments_count ?? 0),
          ]),
        ),
      )
    }

    return res
  }
}
