import {Args, Flags} from '@oclif/core'
import {BaseCommand} from '../../../base'

export default class SecretsAssetsUndelegate extends BaseCommand {
  static args = {id: Args.string({required: true})}
  static flags = {project: Flags.string({char: 'p', required: true})}
  async run(): Promise<unknown> {
    const {args, flags} = await this.parse(SecretsAssetsUndelegate)
    const projectId = await this.resolveProjectId(flags.project)
    await this.api.delete(`/cli/v1/shared_secret_assets/${encodeURIComponent(args.id)}/undelegate?project_id=${encodeURIComponent(projectId)}`)
    if (!this.jsonEnabled()) this.log(`Removed shared-asset delegation from ${flags.project}`)
    return {undelegated: true, project_id: projectId}
  }
}
