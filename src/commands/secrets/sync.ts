import {BaseCommand, projectFlag} from '../../base'

export default class SecretsSync extends BaseCommand {
  static description = "Push the project's vault secrets to its connected GitHub repo Environment secrets (enqueues a background sync). Requires the github.manage permission."

  static examples = ['<%= config.bin %> secrets sync -p acme-api']

  static flags = {
    ...projectFlag,
  }

  async run(): Promise<unknown> {
    const {flags} = await this.parse(SecretsSync)
    const projectId = await this.resolveProjectId(flags.project)
    const res = await this.api.post<{enqueued?: boolean}>(
      `/cli/v1/projects/${encodeURIComponent(projectId)}/secrets/sync`,
    )

    if (!this.jsonEnabled()) {
      this.log(`Secret sync enqueued for project ${flags.project}.`)
    }

    return res
  }
}
