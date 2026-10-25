import {Args} from '@oclif/core'
import {BaseCommand} from '../../base'
import {renderRecord, section} from '../../lib/output'

/** A nested object of the payload, or `{}` when the field is absent. */
function nested(data: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = data[key]
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export default class SeoShow extends BaseCommand {
  static description = 'Show a single SEO finding, with the evidence behind it'

  static examples = ['<%= config.bin %> seo show <issue-id>']

  static args = {
    id: Args.string({description: 'SEO finding id', required: true}),
  }

  async run(): Promise<unknown> {
    const {args} = await this.parse(SeoShow)
    const res = await this.api.get<Record<string, unknown>>(`/cli/v1/seo/${args.id}`)

    if (!this.jsonEnabled()) {
      const data = res.data ?? {}
      // Evidence in a block of its own: it is the reason the finding exists, and burying it among
      // the metadata means reopening the browser to see what was actually found.
      this.log(renderRecord({...data, evidence: undefined}))
      this.log(section('Evidence', '🔎'))
      this.log(renderRecord(nested(data, 'evidence')))
      this.log(section('Site', '🌐'))
      this.log(renderRecord(nested(data, 'site')))
      this.log(section('Project', '📦'))
      this.log(renderRecord(nested(data, 'project')))
    }

    return res
  }
}
