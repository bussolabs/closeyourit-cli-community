import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import {renderRecord} from '../../../lib/output'

export default class MonitorsAnnouncementsShow extends BaseCommand {
  static description = 'Show the status page announcement banner for a monitor (null if none)'

  static examples = ['<%= config.bin %> monitors announcements show <monitor-id> --project acme-api']

  static args = {
    monitor: Args.string({description: 'Monitor id', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MonitorsAnnouncementsShow)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Record<string, unknown> | null>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/monitors/${encodeURIComponent(args.monitor)}/announcement`,
    )

    if (!this.jsonEnabled()) {
      const announcement = res.data
      this.log(announcement ? renderRecord(announcement) : 'No announcement set.')
    }

    return res
  }
}
