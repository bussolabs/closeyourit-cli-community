import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class MilestonesShow extends BaseCommand {
  static description = 'Show a single milestone'

  static examples = ['<%= config.bin %> milestones show <milestone-id> --project acme-api']

  static args = {
    id: Args.string({description: 'Milestone id', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MilestonesShow)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/milestones/${encodeURIComponent(args.id)}`,
    )

    if (!this.jsonEnabled()) {
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
