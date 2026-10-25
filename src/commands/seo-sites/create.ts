import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'
import {renderRecord} from '../../lib/output'

export default class SeoSitesCreate extends BaseCommand {
  static description = 'Declare a site to keep an eye on (one per project and environment)'

  static examples = [
    '<%= config.bin %> seo-sites create --project acme-site --url https://www.acme.example --environment <env-id>',
    '<%= config.bin %> seo-sites create -p acme-site --url https://www.acme.example --environment <env-id> --frequency weekly --max-pages 50',
  ]

  static flags = {
    ...projectFlag,
    url: Flags.string({description: 'Public address the visit starts from', required: true}),
    environment: Flags.string({description: 'Environment id (must be declared by the project)', required: true}),
    frequency: Flags.string({description: 'How often to check it: daily (default) or weekly', options: ['daily', 'weekly']}),
    'max-pages': Flags.integer({description: 'How many pages to visit at most each run'}),
    'no-sitemap': Flags.boolean({description: "Don't read the sitemap: start from the home page and follow links only"}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(SeoSitesCreate)
    const projectId = await this.resolveProjectId(flags.project)

    const body: Record<string, unknown> = {
      project_id: projectId,
      environment_id: flags.environment,
      base_url: flags.url,
    }
    if (flags.frequency !== undefined) body.frequency = flags.frequency
    if (flags['max-pages'] !== undefined) body.max_pages = flags['max-pages']
    if (flags['no-sitemap']) body.follow_sitemap = false

    const res = await this.api.post<Record<string, unknown>>('/cli/v1/seo_sites', body)

    if (!this.jsonEnabled()) {
      this.log(renderRecord(res.data ?? {}))
      // The first run starts on creation: without saying so, an empty list looks like a failure.
      this.log('First check queued.')
    }

    return res
  }
}
