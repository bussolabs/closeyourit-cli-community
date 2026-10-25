import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../base'

export default class SeoIgnore extends BaseCommand {
  static description = 'Ignore an SEO finding: you accept living with it'

  static examples = [
    '<%= config.bin %> seo ignore <issue-id>',
    '<%= config.bin %> seo ignore <issue-id> --note "Service page, not meant to be found."',
  ]

  static args = {
    id: Args.string({description: 'SEO finding id', required: true}),
  }

  static flags = {
    note: Flags.string({description: 'Why you are keeping it (shown alongside the ignored row)'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(SeoIgnore)
    const res = await this.api.put(`/cli/v1/seo/${args.id}/ignore`, {triage_note: flags.note})

    if (!this.jsonEnabled()) {
      // An ignored finding never reopens on its own: the next check won't undo a decision taken.
      this.log(`SEO finding ${args.id} ignored.`)
    }

    return res
  }
}
