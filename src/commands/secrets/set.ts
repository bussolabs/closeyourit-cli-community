import {Args, Flags} from '@oclif/core'
import {BaseCommand, environmentFlag, projectFlag} from '../../base'

export default class SecretsSet extends BaseCommand {
  static args = {
    assignment: Args.string({description: 'NAME=VALUE, or just NAME with --value', required: true}),
  }

  static description = 'Set (create or update) a secret for a project environment'

  static examples = [
    '<%= config.bin %> secrets set -p acme-api -e production DATABASE_URL=postgres://user:pass@host/db',
    '<%= config.bin %> secrets set -p acme-api -e production API_KEY --value s3cr3t --description "Stripe key"',
  ]

  static flags = {
    ...projectFlag,
    ...environmentFlag,
    value: Flags.string({description: 'Secret value (use when the arg is just NAME)'}),
    description: Flags.string({description: 'Optional description'}),
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(SecretsSet)
    const projectId = await this.resolveProjectId(flags.project)

    const eq = args.assignment.indexOf('=')
    const name = eq === -1 ? args.assignment : args.assignment.slice(0, eq)
    const value = eq === -1 ? flags.value : args.assignment.slice(eq + 1)
    if (value === undefined) {
      this.error('Provide a value: use NAME=VALUE or pass --value', {exit: 1})
    }

    const res = await this.api.post<Record<string, unknown>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/secrets`,
      {environment: flags.environment, name, value, description: flags.description},
    )

    if (!this.jsonEnabled()) {
      this.log(`Secret ${String(name).toUpperCase()} saved (${flags.environment}).`)
      this.logConsolidationHint(res.meta?.consolidation)
    }

    return res
  }

  /**
   * The server may say the value just saved already exists in other projects of the organization
   * (a "Valore in comune" candidate). It sends only how many projects hold it (this one included) and the vault page: never project names.
   */
  private logConsolidationHint(hint: unknown): void {
    if (!hint || typeof hint !== 'object') return
    const {count, url} = hint as {count?: unknown; url?: unknown}
    if (typeof count !== 'number' || count < 2 || typeof url !== 'string') return

    const where = url.startsWith('http') ? url : `${this.cfg.apiUrl.replace(/\/$/, '')}${url}`
    this.log(`This value is used by ${count} projects in your organization (this one included). Move it to the organization secrets: ${where}`)
  }
}
