import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../base'

export default class TokensRevoke extends BaseCommand {
  static description = 'Revoke an ingest token'

  static examples = ['<%= config.bin %> tokens revoke <token-id> --project acme-api']

  static args = {
    id: Args.string({description: 'Token id', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TokensRevoke)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.delete(`/cli/v1/projects/${projectId}/tokens/${args.id}`)

    if (!this.jsonEnabled()) {
      this.log(`Token ${args.id} revoked.`)
    }

    return res
  }
}
