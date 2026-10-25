import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import {renderRecord} from '../../../lib/output'

export default class MonitorsAnnouncementsSet extends BaseCommand {
  static description = 'Upsert the status page announcement banner for a monitor'

  static examples = [
    '<%= config.bin %> monitors announcements set <monitor-id> --project acme-api --level maintenance --message "Scheduled DB upgrade"',
    '<%= config.bin %> monitors announcements set <monitor-id> -p acme-api --level warning --message "Degraded" --starts-at 2026-07-10T09:00:00Z --ends-at 2026-07-10T11:00:00Z --active',
  ]

  static args = {
    monitor: Args.string({description: 'Monitor id', required: true}),
  }

  static flags = {
    ...projectFlag,
    level: Flags.string({description: 'Banner level', options: ['info', 'maintenance', 'warning']}),
    message: Flags.string({description: 'Banner message'}),
    'starts-at': Flags.string({description: 'Start time (ISO 8601)'}),
    'ends-at': Flags.string({description: 'End time (ISO 8601)'}),
    active: Flags.boolean({allowNo: true, description: 'Whether the banner is active'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MonitorsAnnouncementsSet)
    const projectId = await this.resolveProjectId(flags.project)

    const body: Record<string, unknown> = {}
    if (flags.level !== undefined) body.level = flags.level
    if (flags.message !== undefined) body.message = flags.message
    if (flags['starts-at'] !== undefined) body.starts_at = flags['starts-at']
    if (flags['ends-at'] !== undefined) body.ends_at = flags['ends-at']
    if (flags.active !== undefined) body.active = flags.active

    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/monitors/${encodeURIComponent(args.monitor)}/announcement`,
      body,
    )

    if (!this.jsonEnabled()) {
      this.log('Announcement saved:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
