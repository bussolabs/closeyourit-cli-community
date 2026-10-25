import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class SeoSitesDelete extends BaseCommand {
  static description = 'Stop watching a site and remove its pages and findings'

  static examples = ['<%= config.bin %> seo-sites delete <site-id>']

  static args = {
    id: Args.string({description: 'Site id', required: true}),
  }

  async run(): Promise<unknown> {
    const {args} = await this.parse(SeoSitesDelete)
    const res = await this.api.delete(`/cli/v1/seo_sites/${args.id}`)

    if (!this.jsonEnabled()) {
      // Pages and findings go with it: to keep the history, pause the site instead (`update --disable`).
      this.log(`Site ${args.id} removed, with its pages and findings.`)
    }

    return res
  }
}
