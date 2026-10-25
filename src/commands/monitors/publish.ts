import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class MonitorsPublish extends BaseCommand {
  static description = 'Publish the public status page for a monitor (opt-in)'

  static examples = ['<%= config.bin %> monitors publish <monitor-id> --project acme-api']

  static args = {
    id: Args.string({description: 'Monitor id', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MonitorsPublish)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/monitors/${encodeURIComponent(args.id)}/publication`,
    )

    if (!this.jsonEnabled()) this.log(`Published status page for monitor ${args.id}`)

    return res
  }
}
