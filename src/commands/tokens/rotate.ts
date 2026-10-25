import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class TokensRotate extends BaseCommand {
  static description = 'Rotate an ingest token (the new secret is shown only once)'

  static examples = ['<%= config.bin %> tokens rotate <token-id> --project acme-api']

  static args = {
    id: Args.string({description: 'Token id', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TokensRotate)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.put<Record<string, unknown>>(
      `/cli/v1/projects/${projectId}/tokens/${args.id}/rotation`,
    )
    const token = res.data ?? {}

    if (!this.jsonEnabled()) {
      this.log('Token rotated. Store the new credentials now — they are shown only once:')
      this.log('')
      this.log(`  secret: ${token.secret ?? '-'}`)
      this.log(`  dsn:    ${token.dsn ?? '-'}`)
      this.log('')
      this.warn('The previous secret is now invalid and the new one cannot be retrieved again.')
    }

    return res
  }
}
