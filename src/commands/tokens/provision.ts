import {Flags} from '@oclif/core'
import {randomUUID} from 'node:crypto'
import {BaseCommand, projectFlag} from '../../base'
import {safeTokenProvisionEnvelope} from '../../lib/token-provision'

export default class TokensProvision extends BaseCommand {
  static description = 'Generate an ingest token and deliver it without revealing the secret'

  static examples = [
    '<%= config.bin %> tokens provision -p CYRA --name "Self monitoring" --environment-id staging --to-project CYRA --to-environment-id staging --secret-name CLOSEYOURIT_TOKEN',
  ]

  static flags = {
    ...projectFlag,
    name: Flags.string({description: 'Human-readable token name', required: true}),
    'environment-id': Flags.string({description: 'Source environment code or id', required: true}),
    scope: Flags.string({description: 'Token scope (repeatable)', multiple: true, options: ['ingest', 'read']}),
    'to-project': Flags.string({description: 'Destination project id or key', required: true}),
    'to-environment-id': Flags.string({description: 'Destination environment code or id', required: true}),
    'secret-name': Flags.string({description: 'Destination vault variable name', required: true}),
    'idempotency-key': Flags.string({description: 'Stable key for safe request retries'}),
    'sync-github': Flags.boolean({description: 'Synchronize the destination vault to GitHub', default: true, allowNo: true}),
    'confirm-production': Flags.boolean({description: 'Required when source or destination is production'}),
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(TokensProvision)
    const [projectId, destinationProjectId] = await Promise.all([
      this.resolveProjectId(flags.project),
      this.resolveProjectId(flags['to-project']),
    ])
    const response = await this.api.post<unknown>(`/cli/v1/projects/${projectId}/tokens/provisions`, {
      name: flags.name,
      environment_id: flags['environment-id'],
      scopes: flags.scope?.length ? flags.scope : ['ingest'],
      idempotency_key: flags['idempotency-key'] ?? randomUUID(),
      sync_github: flags['sync-github'],
      confirm_production: flags['confirm-production'] ?? false,
      destination: {
        project_id: destinationProjectId,
        environment_id: flags['to-environment-id'],
        secret_name: flags['secret-name'],
      },
    })
    const safe = safeTokenProvisionEnvelope(response)

    if (!this.jsonEnabled()) {
      const data = safe.data as {token?: Record<string, unknown>; provision?: Record<string, unknown>}
      this.log('Token generated and delivered without revealing its value.')
      this.log(`  provision: ${data.provision?.id ?? '-'}`)
      this.log(`  token:     ${data.token?.id ?? '-'}`)
      this.log(`  prefix:    ${data.token?.token_prefix ?? '-'}`)
      this.log(`  status:    ${data.provision?.status ?? '-'}`)
    }

    return safe
  }
}
