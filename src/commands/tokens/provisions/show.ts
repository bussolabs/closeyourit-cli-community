import {Args} from '@oclif/core'
import {BaseCommand, projectFlag} from '../../../base'
import {safeTokenProvisionEnvelope} from '../../../lib/token-provision'

export default class TokensProvisionsShow extends BaseCommand {
  static description = 'Show secret-free token provision status'

  static args = {
    id: Args.string({description: 'Provision id', required: true}),
  }

  static flags = {...projectFlag}

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(TokensProvisionsShow)
    const projectId = await this.resolveProjectId(flags.project)
    const response = await this.api.get<unknown>(`/cli/v1/projects/${projectId}/tokens/provisions/${args.id}`)
    const safe = safeTokenProvisionEnvelope(response)

    if (!this.jsonEnabled()) {
      const data = safe.data as {token?: Record<string, unknown>; provision?: Record<string, unknown>}
      this.log(`Provision ${data.provision?.id ?? args.id}`)
      this.log(`  status:      ${data.provision?.status ?? '-'}`)
      this.log(`  destination: ${data.provision?.destination_project_id ?? '-'} / ${data.provision?.destination_environment_id ?? '-'}`)
      this.log(`  secret name: ${data.provision?.secret_name ?? '-'}`)
      if (data.provision?.error_code) this.log(`  error:       ${data.provision.error_code}`)
    }

    return safe
  }
}
