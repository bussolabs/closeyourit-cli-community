import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import {safeTokenProvisionEnvelope} from '../../../lib/token-provision'

export default class TokensProvisionsRetry extends BaseCommand {
  static description = 'Retry GitHub synchronization without regenerating or revealing the token'

  static args = {
    id: Args.string({description: 'Provision id', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TokensProvisionsRetry)
    const projectId = await this.resolveProjectId(flags.project)
    const response = await this.api.post<unknown>(
      `/cli/v1/projects/${projectId}/tokens/provisions/${args.id}/retry`,
    )
    const safe = safeTokenProvisionEnvelope(response)

    if (!this.jsonEnabled()) {
      const provision = safe.data as Record<string, unknown>
      this.log(`Provision ${provision.id ?? args.id} queued again.`)
      this.log(`  status: ${provision.status ?? '-'}`)
    }

    return safe
  }
}
