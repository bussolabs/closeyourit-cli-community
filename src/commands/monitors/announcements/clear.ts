import {Args, Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'

export default class MonitorsAnnouncementsClear extends BaseCommand {
  static description = 'Remove the status page announcement banner for a monitor'

  static examples = ['<%= config.bin %> monitors announcements clear <monitor-id> --project acme-api --confirm']

  static args = {
    monitor: Args.string({description: 'Monitor id', required: true}),
  }

  static flags = {
    ...projectFlag,
    confirm: Flags.boolean({description: 'Required: confirm the removal'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(MonitorsAnnouncementsClear)

    if (!flags.confirm) {
      this.error('Refusing to clear the announcement without --confirm.', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/monitors/${encodeURIComponent(args.monitor)}/announcement`,
    )

    if (!this.jsonEnabled()) this.log(`Cleared announcement for monitor ${args.monitor}`)

    return {cleared: args.monitor}
  }
}
