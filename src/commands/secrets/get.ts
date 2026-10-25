import {Args} from '@oclif/core'
import {BaseCommand, environmentFlag, projectFlag} from '../../base'

export default class SecretsGet extends BaseCommand {
  static args = {
    name: Args.string({description: 'Secret name', required: true}),
  }

  static description = 'Print the value of a single secret (pipeable). Requires the secrets.read permission.'

  static examples = ['<%= config.bin %> secrets get -p acme-api -e production DATABASE_URL']

  static flags = {
    ...projectFlag,
    ...environmentFlag,
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(SecretsGet)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.get<Record<string, string>>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/secrets/bundle?environment=${encodeURIComponent(flags.environment)}`,
    )

    const map = res.data ?? {}
    const key = args.name.toUpperCase()
    if (!(key in map)) {
      this.error(`Secret not found: ${key} (${flags.environment})`, {exit: 1})
    }

    if (!this.jsonEnabled()) {
      this.log(map[key])
    }

    return {name: key, value: map[key]}
  }
}
