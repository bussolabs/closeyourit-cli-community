import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class MonitorsUnpublish extends BaseCommand {
  static description = 'Unpublish the public status page for a monitor'

  static examples = ['<%= config.bin %> monitors unpublish <monitor-id> --project acme-api']

  static args = {
    id: Args.string({description: 'Monitor id', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MonitorsUnpublish)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.delete<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/monitors/${encodeURIComponent(args.id)}/publication`,
    )

    if (!this.jsonEnabled()) this.log(`Unpublished status page for monitor ${args.id}`)

    return res
  }
}
