import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class SeoRescan extends BaseCommand {
  static description = 'Check a site now, without waiting for the next scheduled run'

  static examples = ['<%= config.bin %> seo rescan --site <site-id>']

  // Required: a check always targets one site (a project can declare one per environment).
  static flags = {
    site: Flags.string({description: 'Site id (from `seo-sites list`)', required: true}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(SeoRescan)
    const res = await this.api.post('/cli/v1/seo/rescan', {site_id: flags.site})

    if (!this.jsonEnabled()) {
      this.log(`Check queued for site ${flags.site}.`)
    }

    return res
  }
}
