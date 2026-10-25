import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord} from '../../lib/output'

export default class SeoSitesUpdate extends BaseCommand {
  static description = 'Change how a site is checked (project and environment are its identity: they never change)'

  static examples = [
    '<%= config.bin %> seo-sites update <site-id> --frequency weekly',
    '<%= config.bin %> seo-sites update <site-id> --max-pages 200 --disable',
  ]

  static args = {
    id: Args.string({description: 'Site id', required: true}),
  }

  static flags = {
    url: Flags.string({description: 'Public address the visit starts from'}),
    frequency: Flags.string({description: 'How often to check it: daily or weekly', options: ['daily', 'weekly']}),
    'max-pages': Flags.integer({description: 'How many pages to visit at most each run'}),
    sitemap: Flags.boolean({description: 'Read the sitemap', allowNo: true}),
    enable: Flags.boolean({description: 'Resume the checks', exclusive: ['disable']}),
    disable: Flags.boolean({description: 'Pause the checks (the site and its findings stay)', exclusive: ['enable']}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(SeoSitesUpdate)

    const body: Record<string, unknown> = {}
    if (flags.url !== undefined) body.base_url = flags.url
    if (flags.frequency !== undefined) body.frequency = flags.frequency
    if (flags['max-pages'] !== undefined) body.max_pages = flags['max-pages']
    if (flags.sitemap !== undefined) body.follow_sitemap = flags.sitemap
    if (flags.enable) body.enabled = true
    if (flags.disable) body.enabled = false

    const res = await this.api.put<Record<string, unknown>>(`/cli/v1/seo_sites/${args.id}`, body)

    if (!this.jsonEnabled()) {
      this.log(renderRecord(res.data ?? {}))
    }

    return res
  }
}
