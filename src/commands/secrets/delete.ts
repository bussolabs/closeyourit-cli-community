import {Args} from '@oclif/core'
import {BaseCommand, environmentFlag, projectFlag} from '../../base'

export default class SecretsDelete extends BaseCommand {
  static args = {
    name: Args.string({description: 'Secret name', required: true}),
  }

  static description = 'Delete a secret from a project environment'

  static examples = ['<%= config.bin %> secrets delete -p acme-api -e production API_KEY']

  static flags = {
    ...projectFlag,
    ...environmentFlag,
  }

  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(SecretsDelete)
    const projectId = await this.resolveProjectId(flags.project)
    const name = args.name.toUpperCase()

    await this.api.delete(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/secrets/${encodeURIComponent(name)}?environment=${encodeURIComponent(flags.environment)}`,
    )

    if (!this.jsonEnabled()) {
      this.log(`Secret ${name} deleted (${flags.environment}).`)
    }

    return {deleted: name}
  }
}
