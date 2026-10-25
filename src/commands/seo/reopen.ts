import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class SeoReopen extends BaseCommand {
  static description = 'Reopen an ignored SEO finding: you changed your mind'

  static examples = ['<%= config.bin %> seo reopen <issue-id>']

  static args = {
    id: Args.string({description: 'SEO finding id', required: true}),
  }

  async run(): Promise<unknown> {
    const {args} = await this.parse(SeoReopen)
    // Reopening is deleting the ignore, not a verb of its own — hence DELETE on the same resource.
    const res = await this.api.delete(`/cli/v1/seo/${args.id}/ignore`)

    if (!this.jsonEnabled()) {
      this.log(`SEO finding ${args.id} reopened.`)
    }

    return res
  }
}
