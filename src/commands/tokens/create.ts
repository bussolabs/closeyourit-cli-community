import {Flags} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class TokensCreate extends BaseCommand {
  static description = 'Create an ingest token (the secret is shown only once)'

  static examples = [
    '<%= config.bin %> tokens create --project acme-api --name "CI prod" --environment-id <env-id>',
  ]

  static flags = {
    ...projectFlag,
    name: Flags.string({description: 'Human-readable token name', required: true}),
    'environment-id': Flags.string({description: 'Environment id the token is scoped to', required: true}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(TokensCreate)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post<Record<string, unknown>>(`/cli/v1/projects/${projectId}/tokens`, {
      name: flags.name,
      environment_id: flags['environment-id'],
    })
    const token = res.data ?? {}

    if (!this.jsonEnabled()) {
      this.log('Token created. Store these credentials now — they are shown only once:')
      this.log('')
      this.log(`  secret: ${token.secret ?? '-'}`)
      this.log(`  dsn:    ${token.dsn ?? '-'}`)
      this.log('')
      this.warn('The secret cannot be retrieved again. If you lose it, rotate the token.')
    }

    return res
  }
}
