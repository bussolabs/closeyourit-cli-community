import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class AnalyticsShare extends BaseCommand {
  static description = 'Publish a public shareable link to the analytics dashboard (optional password)'

  static examples = [
    '<%= config.bin %> analytics share --project acme-web',
    '<%= config.bin %> analytics share -p acme-web --password s3cret',
  ]

  static flags = {
    ...projectFlag,
    password: Flags.string({description: 'Optional password to protect the shared link'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(AnalyticsShare)
    const projectId = await this.resolveProjectId(flags.project)

    const body: Record<string, unknown> = {}
    if (flags.password !== undefined) body.password = flags.password

    const res = await this.api.post<Record<string, unknown>>(`/cli/v1/projects/${projectId}/analytics/share`, body)

    if (!this.jsonEnabled()) {
      this.log('Analytics dashboard shared:')
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
