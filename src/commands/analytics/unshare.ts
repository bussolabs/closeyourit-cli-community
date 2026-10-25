import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class AnalyticsUnshare extends BaseCommand {
  static description = 'Revoke the public analytics dashboard link'

  static examples = ['<%= config.bin %> analytics unshare --project acme-web --confirm']

  static flags = {
    ...projectFlag,
    confirm: Flags.boolean({description: 'Required: confirm revoking the public link'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(AnalyticsUnshare)

    if (!flags.confirm) {
      this.error('Refusing to unshare without --confirm.', {exit: 2})
    }

    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(`/cli/v1/projects/${projectId}/analytics/share`)

    if (!this.jsonEnabled()) this.log('Revoked the public analytics link')

    return {unshared: projectId}
  }
}
